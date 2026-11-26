// MAK/2 public protocol — app-locked grants, host/launch/install tickets.
//
// No device_id. No client timestamp. Every request is a NaCl box envelope
// (X25519 + XSalsa20-Poly1305) and every decision is Ed25519-signed.
// Expiry is signed into grants/tickets; the client enforces it locally and the
// server re-checks it on every call.

import {
  PROTOCOL_V2,
  b64decode,
  b64encode,
  canonicalJson,
  generateGrantId,
  generateTicketId,
  hashIp,
  normalizeHex64,
  nowS,
  randomId,
  sha256Hex,
  signWithProtocol,
  validPackageName,
} from './crypto.js';
import {
  EnvelopeError, isEnvelope, openRequest, sealResponse,
} from './secure.js';
import { loadKeyConfig, publicKeysView } from './keystore.js';
import {
  bindGuestAtomic,
  createHostAtomic,
  findHostForLicensePackage,
  findLicenseByCredential,
  getBinding,
  startLicenseDurationAtomic,
  touchHost,
  touchLicense,
} from './store.js';
import {
  bumpLicenseEpoch,
  consumeNonce,
  createGrantAtomic,
  createGuestV2,
  findGuestByPackageAny,
  findGuestByPackageCert,
  findReusableGrant,
  getGrantById,
  revokeGrant,
  setGuestCert,
  touchGrant,
  updateGuestSeen,
} from './store-v2.js';
import { getSettings } from './settings.js';
import { logEvent } from './events.js';
import { clientIp, json, jsonBody } from './http.js';
import { hitRate, rateHeaders } from './rate.js';

const PROTOCOL = PROTOCOL_V2;
const OPS = ['INSTALL', 'LAUNCH', 'UPDATE', 'RESTART'];
const PERM_KEY = { LAUNCH: 'can_launch', INSTALL: 'can_install', UPDATE: 'can_update', RESTART: 'can_restart' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

function apiJson(obj, status = 200, extra = {}) {
  return json(obj, status, { ...CORS, 'Cache-Control': 'no-store', ...extra });
}

function cleanRequestId(value) {
  const s = String(value || '').trim();
  if (/^[A-Za-z0-9._:-]{4,96}$/.test(s)) return s;
  return randomId('REQ', 12);
}

function cleanAppName(value) {
  return String(value || '').trim().replace(/[^\x20-\x7e]/g, '').slice(0, 120);
}

function licenseProblem(license, now = nowS()) {
  if (!license) return 'INVALID_LICENSE';
  const status = String(license.status || '').toUpperCase();
  if (status === 'REVOKED') return 'LICENSE_REVOKED';
  if (status === 'SUSPENDED') return 'LICENSE_SUSPENDED';
  if (license.expires_at && Number(license.expires_at) <= now) return 'LICENSE_EXPIRED';
  return '';
}

function grantProblem(grant, now = nowS()) {
  if (!grant) return 'GRANT_MISMATCH';
  if (String(grant.status || '').toUpperCase() !== 'ACTIVE') return 'GRANT_REVOKED';
  const lic = licenseProblem({
    status: grant.license_status,
    expires_at: grant.license_expires_at,
  }, now);
  if (lic) return lic;
  if (String(grant.host_status || '').toUpperCase() !== 'ACTIVE') return 'HOST_PACKAGE_MISMATCH';
  if (Number(grant.epoch || 0) < Number(grant.license_epoch || 0)) return 'GRANT_REVOKED';
  return '';
}

function signPayload(payload, config, domain) {
  return signWithProtocol(payload, config, PROTOCOL, domain);
}

async function respond(payload, ctx, status = 200, extra = {}) {
  if (ctx) {
    try {
      const envelope = await sealResponse(payload, ctx, extra.keys || {});
      return apiJson(envelope, status, extra.headers || {});
    } catch (err) {
      // If sealing fails we cannot safely send an encrypted body. Fail closed.
      return apiJson({ protocol: PROTOCOL, decision: 'DENY', code: 'ENVELOPE_INVALID', message: 'Response sealing failed', server_time: nowS() }, 503);
    }
  }
  return apiJson(payload, status, extra.headers || {});
}

async function readPayload(request, env, endpoint, db, keys) {
  let raw;
  try {
    raw = await jsonBody(request);
  } catch {
    throw new HttpError(400, 'UNKNOWN_ERROR', 'Invalid JSON body');
  }
  let ctx = null;
  let payload = raw;
  if (isEnvelope(raw)) {
    try {
      ctx = await openRequest(raw, keys);
    } catch (err) {
      if (err instanceof EnvelopeError) throw new HttpError(err.code === 'ENCRYPTION_NOT_CONFIGURED' ? 503 : 400, err.code, err.message);
      throw new HttpError(400, 'ENVELOPE_INVALID', 'Encrypted envelope rejected');
    }
    payload = ctx.payload;
  } else if (String(env?.MAK_ALLOW_PLAINTEXT || '') === '1') {
    payload = raw;
  } else {
    throw new HttpError(400, 'ENVELOPE_REQUIRED', 'Encrypted envelope required');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'UNKNOWN_ERROR', 'Payload must be an object');
  }
  if (String(payload.protocol || '') !== PROTOCOL) {
    throw new HttpError(400, 'UNKNOWN_ERROR', 'Unsupported protocol');
  }
  // Endpoint tags are compared without leading slashes so clients may send
  // either "activate" or "/activate".
  const tag = (v) => String(v || '').trim().replace(/^\/+/, '');
  if (payload.endpoint && tag(payload.endpoint) !== tag(endpoint)) {
    throw new HttpError(400, 'ENVELOPE_INVALID', 'Envelope endpoint mismatch');
  }

  // Every envelope nonce is single-use. This covers endpoints that do not
  // carry an operation nonce (activate/status/deactivate) as well as the
  // ticket endpoints.
  if (ctx && db) {
    const envelopeNonce = b64encode(ctx.nonce);
    const hash = await sha256Hex(PROTOCOL + '|ENV|' + envelopeNonce);
    const consumed = await consumeNonce(db, hash, endpoint, '', 300);
    if (!consumed.ok) {
      const replay = new HttpError(409, 'NONCE_REPLAY', 'Request nonce was already used');
      replay.ctx = ctx;
      throw replay;
    }
  }
  return { payload, ctx };
}

async function requireNonce(db, payload, endpoint, grantId) {
  const nonce = String(payload.nonce || '').trim();
  const bytes = b64decode(nonce);
  if (bytes.length !== 24) throw new HttpError(400, 'INVALID_NONCE', 'nonce must be a base64 24-byte value');
  const hash = await sha256Hex(PROTOCOL + '|NONCE|' + nonce);
  const consumed = await consumeNonce(db, hash, endpoint, grantId, 300);
  if (!consumed.ok) throw new HttpError(409, 'NONCE_REPLAY', 'Request nonce was already used');
  return nonce;
}

function grantPayload(grant) {
  return {
    v: 2,
    grant_id: grant.grant_id,
    license_uid: grant.license_uid,
    package_name: grant.package_name,
    app_name: grant.app_name || '',
    cert_sha256: grant.cert_sha256 || '',
    signature_bind: !!grant.signature_bind,
    features: OPS.slice(),
    expires_at: grant.expires_at || null,
    epoch: Number(grant.epoch || 1),
    issued_at: Number(grant.created_at || nowS()),
  };
}

function ticketBase(grant) {
  return {
    v: 2,
    grant_id: grant.grant_id,
    package_name: grant.package_name,
    app_name: grant.app_name || '',
    cert_sha256: grant.cert_sha256 || '',
    epoch: Number(grant.epoch || 1),
    expires_at: grant.expires_at || null,
    issued_at: nowS(),
  };
}

async function log(db, input) {
  await logEvent(db, {
    ...input,
    request_id: input.request_id || '',
    ip_hash: input.ip_hash || '',
  }).catch(() => {});
}

export async function handleMakV2(request, env, db) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (!path.startsWith('/mak/v2')) return null;
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'Cache-Control': 'no-store' } });
  }

  const keys = await loadKeyConfig(db, env);
  const config = keys.signing;
  const enc = keys.encryption;
  const settings = await getSettings(db);
  const ip = clientIp(request);
  const ipHash = await hashIp(ip, env);
  const endpoint = path.slice('/mak/v2'.length) || '/';

  // Public status is intentionally readable without an envelope: the client
  // needs the signing key + encryption key to bootstrap. The keys are
  // generated and rotated from the panel, never compiled into the AAR. An
  // existing client accepts a rotated key only after verifying the signed
  // rotation chain published here.
  if ((endpoint === '/status' || endpoint === '/health') && method === 'GET') {
    const payload = {
      protocol: PROTOCOL,
      service: String(env.MAK_SERVER_NAME || 'MAK Activation'),
      version: settings.server_version,
      server_enabled: !!settings.server_enabled,
      signing_ready: !!config.ok,
      key_id: config.ok ? config.active.key_id : null,
      public_keys: publicKeysView(config),
      key_source: keys.source,
      rotations: keys.rotations,
      signature_alg: 'Ed25519',
      encryption: 'X25519+HKDF-SHA256+XSalsa20-Poly1305',
      encryption_ready: !!enc.ok,
      encryption_key_id: enc.key_id,
      encryption_public_key: enc.ok ? enc.public_key : null,
      envelope_version: 3,
      envelope_suite: 'MAK/2-DHE-V3',
      transport: 'TLS 1.3 + dual-ephemeral NaCl box',
      features: OPS.slice(),
      server_time: nowS(),
    };
    return apiJson(config.ok ? signPayload(payload, config, 'STATUS') : { ...payload, decision: 'INFO' });
  }

  if (!config.ok) {
    return apiJson({
      protocol: PROTOCOL, decision: 'DENY', code: 'SERVER_ERROR',
      message: 'Signing key is not configured', server_time: nowS(),
    }, 503);
  }
  if (!settings.server_enabled) {
    return apiJson({
      protocol: PROTOCOL, decision: 'DENY', code: 'SERVER_DISABLED',
      message: settings.maintenance_message || 'Activation service is disabled', server_time: nowS(),
    }, 503);
  }

  let ctx = null;
  try {
    if (endpoint === '/activate' && method === 'POST') {
      const rl = hitRate('mak2:activate:' + ip, 60, 60_000);
      if (!rl.allowed) throw new HttpError(429, 'RATE_LIMITED', 'Too many activation attempts');
      const read = await readPayload(request, env, endpoint, db, keys);
      ctx = read.ctx;
      const body = read.payload;
      const requestId = cleanRequestId(body.request_id);

      let license = await findLicenseByCredential(db, body.mak);
      if (!license) throw new HttpError(403, 'INVALID_LICENSE', 'Invalid MAK credential');
      const licProblem = licenseProblem(license);
      if (licProblem) throw new HttpError(403, licProblem, 'License is not active');

      const packageName = validPackageName(body.package_name);
      if (!packageName) throw new HttpError(403, 'HOST_PACKAGE_MISMATCH', 'Invalid host package name');
      const appName = cleanAppName(body.app_name) || packageName;
      const signatureBind = !!Number(license.signature_bind);
      const cert = normalizeHex64(body.cert_sha256);
      if (signatureBind && !cert) throw new HttpError(403, 'HOST_CERT_MISMATCH', 'Host signing certificate is required');

      let host = await findHostForLicensePackage(db, license.id, packageName);
      if (host) {
        if (String(host.status || '').toUpperCase() !== 'ACTIVE') {
          throw new HttpError(403, 'HOST_PACKAGE_MISMATCH', 'Host binding is suspended');
        }
        if (signatureBind && host.cert_sha256 && String(host.cert_sha256).toLowerCase() !== cert) {
          throw new HttpError(403, 'HOST_CERT_MISMATCH', 'Host signing certificate mismatch');
        }
        if (signatureBind && !host.cert_sha256 && cert) {
          await db.prepare('UPDATE mak_hosts SET cert_sha256=?,updated_at=? WHERE id=?')
            .bind(cert, nowS(), host.id).run().catch(() => {});
          host.cert_sha256 = cert;
        }
        // Host identity is MAK + package + app name + certificate. A host
        // package cannot silently change its display identity after binding.
        const boundAppName = cleanAppName(host.app_name);
        if (boundAppName && boundAppName !== appName) {
          throw new HttpError(403, 'HOST_APP_MISMATCH', 'Host app name does not match the bound identity');
        }
        if (!boundAppName) {
          await db.prepare('UPDATE mak_hosts SET app_name=?,updated_at=? WHERE id=?')
            .bind(appName, nowS(), host.id).run().catch(() => {});
          host.app_name = appName;
        }
      } else {
        const mode = String(license.host_bind_mode || 'AUTO').toUpperCase();
        if (mode === 'MANUAL') {
          throw new HttpError(403, 'HOST_PACKAGE_MISMATCH', 'Host package is not pre-registered for this license');
        }
        const created = await createHostAtomic(db, license.id, {
          package_name: packageName,
          app_name: appName,
          cert_sha256: signatureBind ? cert : '',
          maxPackages: license.max_packages,
        });
        if (!created.ok) throw new HttpError(403, 'PACKAGE_LIMIT_REACHED', 'Host package limit reached');
        host = created.host;
        await log(db, {
          license_id: license.id, host_id: host.id, event_type: 'HOST_BOUND',
          result: 'SUCCESS', request_id: requestId, ip_hash: ipHash,
          detail: 'Host package auto-bound: ' + packageName + ' / ' + appName,
        });
      }

      // No device seats and no installed-app count limit: every device that
      // presents the same host identity shares one active grant, and any
      // number of guest APKs may be bound to that grant. The four-field host
      // identity (MAK + package + app name + certificate) is the boundary.
      let grant = await findReusableGrant(db, license.id, host.id, packageName,
        signatureBind ? cert : '', appName);
      if (!grant) {
        const created = await createGrantAtomic(db, {
          grant_id: generateGrantId(),
          license_id: license.id,
          host_id: host.id,
          package_name: packageName,
          app_name: appName,
          cert_sha256: signatureBind ? cert : '',
          epoch: Number(license.epoch || 1),
        });
        if (!created.ok) throw new HttpError(503, 'GRANT_CREATE_FAILED', 'Could not create host grant');
        grant = created.grant;
      }

      // First successful runtime app bind starts a numeric duration exactly
      // once. Later binds reuse the original started_at / expires_at values.
      if (Number(license.duration_days) > 0 && !license.started_at) {
        const started = await startLicenseDurationAtomic(db, license.id);
        if (started) {
          license = { ...license, ...started };
          await log(db, {
            license_id: license.id, host_id: host.id, event_type: 'LICENSE_STARTED',
            result: 'SUCCESS', request_id: requestId, ip_hash: ipHash,
            detail: 'Duration started on first app bind; expires ' + Number(license.expires_at),
          });
        }
      }

      await touchLicense(db, license.id);
      await touchHost(db, host.id);
      await log(db, {
        license_id: license.id, host_id: host.id, event_type: 'ACTIVATED',
        result: 'ALLOW', request_id: requestId, ip_hash: ipHash,
        detail: 'Grant ' + grant.grant_id + ' issued for ' + packageName,
      });

      const grantOut = signPayload({
        ...grantPayload(grant),
        license_uid: license.license_uid,
        signature_bind: signatureBind,
        expires_at: license.expires_at || null,
        epoch: Number(license.epoch || 1),
        issued_at: Number(grant.created_at || nowS()),
      }, config, 'GRANT');

      const payload = signPayload({
        protocol: PROTOCOL,
        decision: 'ALLOW',
        code: 'ACTIVATED',
        request_id: requestId,
        grant: grantOut,
        server_time: nowS(),
      }, config, 'RESPONSE');
      return await respond(payload, ctx, 200, { env, keys, headers: rateHeaders(rl) });
    }

    if (endpoint === '/host/verify' && method === 'POST') {
      const rl = hitRate('mak2:host:' + ip, 180, 60_000);
      if (!rl.allowed) throw new HttpError(429, 'RATE_LIMITED', 'Too many host verification attempts');
      const read = await readPayload(request, env, endpoint, db, keys);
      ctx = read.ctx;
      const body = read.payload;
      const requestId = cleanRequestId(body.request_id);

      const license = await findLicenseByCredential(db, body.mak);
      if (!license) throw new HttpError(403, 'INVALID_LICENSE', 'Invalid MAK credential');
      const grant = await getGrantById(db, body.grant_id);
      const problem = grantProblem(grant);
      if (problem) throw new HttpError(403, problem, 'Grant is not active');
      if (Number(grant.license_id) !== Number(license.id)) throw new HttpError(403, 'GRANT_MISMATCH', 'Grant does not belong to this MAK');

      const packageName = validPackageName(body.package_name);
      if (!packageName || packageName !== grant.package_name) throw new HttpError(403, 'HOST_PACKAGE_MISMATCH', 'Host package mismatch');
      const appName = cleanAppName(body.app_name);
      const boundAppName = cleanAppName(grant.app_name);
      if (boundAppName && appName !== boundAppName) {
        throw new HttpError(403, 'HOST_APP_MISMATCH', 'Host app name does not match the bound identity');
      }
      const cert = normalizeHex64(body.cert_sha256);
      if (grant.signature_bind && cert && grant.cert_sha256 && cert !== String(grant.cert_sha256).toLowerCase()) {
        throw new HttpError(403, 'HOST_CERT_MISMATCH', 'Host signing certificate mismatch');
      }
      if (grant.signature_bind && !grant.cert_sha256) throw new HttpError(403, 'HOST_CERT_MISMATCH', 'Host certificate is not bound');
      const nonce = await requireNonce(db, body, endpoint, grant.grant_id);

      await touchGrant(db, grant.grant_id);
      await touchLicense(db, license.id);
      await touchHost(db, grant.host_id);
      await log(db, {
        license_id: license.id, host_id: grant.host_id, event_type: 'HOST_VERIFY',
        result: 'ALLOW', request_id: requestId, ip_hash: ipHash,
        detail: 'Host ticket issued for ' + packageName,
      });

      const ticket = signPayload({
        ...ticketBase({
          ...grant,
          expires_at: license.expires_at || null,
          epoch: Number(license.epoch || grant.epoch || 1),
        }),
        ticket_id: generateTicketId('HT'),
        nonce,
      }, config, 'HOST-TICKET');

      const payload = signPayload({
        protocol: PROTOCOL,
        decision: 'ALLOW',
        code: 'HOST_VERIFIED',
        request_id: requestId,
        ticket,
        server_time: nowS(),
      }, config, 'RESPONSE');
      return await respond(payload, ctx, 200, { env, keys, headers: rateHeaders(rl) });
    }

    if (endpoint === '/guest/check' && method === 'POST') {
      const rl = hitRate('mak2:guest:' + ip, 240, 60_000);
      if (!rl.allowed) throw new HttpError(429, 'RATE_LIMITED', 'Too many guest checks');
      const read = await readPayload(request, env, endpoint, db, keys);
      ctx = read.ctx;
      const body = read.payload;
      const requestId = cleanRequestId(body.request_id);

      const operation = String(body.operation || '').toUpperCase();
      if (!OPS.includes(operation)) throw new HttpError(400, 'UNKNOWN_ERROR', 'Unsupported operation');

      const license = await findLicenseByCredential(db, body.mak);
      if (!license) throw new HttpError(403, 'INVALID_LICENSE', 'Invalid MAK credential');
      const grant = await getGrantById(db, body.grant_id);
      const problem = grantProblem(grant);
      if (problem) throw new HttpError(403, problem, 'Grant is not active');
      if (Number(grant.license_id) !== Number(license.id)) throw new HttpError(403, 'GRANT_MISMATCH', 'Grant does not belong to this MAK');

      const hostPackage = validPackageName(body.package_name);
      if (!hostPackage || hostPackage !== grant.package_name) throw new HttpError(403, 'HOST_PACKAGE_MISMATCH', 'Host package mismatch');
      const hostAppName = cleanAppName(body.app_name);
      const boundHostAppName = cleanAppName(grant.app_name);
      if (boundHostAppName && hostAppName !== boundHostAppName) {
        throw new HttpError(403, 'HOST_APP_MISMATCH', 'Host app name does not match the bound identity');
      }
      const hostCert = normalizeHex64(body.cert_sha256);
      if (grant.signature_bind && hostCert && grant.cert_sha256 && hostCert !== String(grant.cert_sha256).toLowerCase()) {
        throw new HttpError(403, 'HOST_CERT_MISMATCH', 'Host signing certificate mismatch');
      }

      const guestInput = body.guest && typeof body.guest === 'object' ? body.guest : {};
      const guestPackage = validPackageName(guestInput.package_name);
      const guestAppName = cleanAppName(guestInput.app_name) || guestPackage;
      const guestCert = normalizeHex64(guestInput.cert_sha256);
      const apkHash = normalizeHex64(guestInput.apk_sha256);
      const versionCode = Number(guestInput.version_code || 0);
      if (!guestPackage || !apkHash || !Number.isFinite(versionCode) || versionCode < 0) {
        throw new HttpError(400, 'APK_INVALID', 'Guest identity is malformed');
      }
      if (grant.signature_bind && !guestCert) {
        throw new HttpError(403, 'GUEST_CERT_MISMATCH', 'Guest signing certificate is required');
      }
      const nonce = await requireNonce(db, body, endpoint, grant.grant_id);

      let guest = grant.signature_bind
        ? await findGuestByPackageCert(db, guestPackage, guestCert)
        : await findGuestByPackageAny(db, guestPackage);
      if (guest && grant.signature_bind && guest.cert_sha256 && String(guest.cert_sha256).toLowerCase() !== guestCert) {
        throw new HttpError(403, 'GUEST_CERT_MISMATCH', 'Guest signing certificate is not approved');
      }

      const mode = String(license.host_bind_mode || 'AUTO').toUpperCase();
      if (!guest) {
        if (mode === 'MANUAL') throw new HttpError(403, 'GUEST_PACKAGE_MISMATCH', 'Guest app is not approved');
        guest = await createGuestV2(db, {
          package_name: guestPackage,
          app_name: guestAppName,
          apk_sha256: apkHash,
          cert_sha256: grant.signature_bind ? guestCert : '',
          version_code: versionCode,
        });
        if (!guest) throw new HttpError(403, 'GUEST_PACKAGE_MISMATCH', 'Could not register guest app');
      } else {
        if (grant.signature_bind && !guest.cert_sha256) {
          await setGuestCert(db, guest.id, guestCert);
          guest.cert_sha256 = guestCert;
        }
        const knownGuestAppName = cleanAppName(guest.app_name);
        if (mode === 'MANUAL' && knownGuestAppName && knownGuestAppName !== guestAppName) {
          throw new HttpError(403, 'GUEST_APP_MISMATCH', 'Guest app name does not match the pre-registered identity');
        }
        await updateGuestSeen(db, guest.id, {
          app_name: guestAppName,
          apk_sha256: apkHash,
          version_code: versionCode,
        });
      }

      let binding = await getBinding(db, license.id, guest.id, grant.host_id);
      if (!binding) {
        if (mode === 'MANUAL') throw new HttpError(403, 'GUEST_PACKAGE_MISMATCH', 'Guest app is not bound to this host');
        // Unlimited guest bindings: MAK/2 no longer enforces max_apps or any
        // per-package installed-app count. The signed host/guest identity is
        // still verified, only the arbitrary quantity cap is gone.
        const bound = await bindGuestAtomic(
          db, license.id, grant.host_id, guest.id, guest.package_name,
          { launch: true, install: true, update: true, restart: true },
        );
        if (!bound.ok) throw new HttpError(403, 'GUEST_PACKAGE_MISMATCH', 'Could not bind guest app');
        binding = bound.binding;
      }
      if (String(binding.status || '').toUpperCase() !== 'ACTIVE') {
        throw new HttpError(403, 'GUEST_PACKAGE_MISMATCH', 'Guest binding is suspended');
      }
      const permKey = PERM_KEY[operation];
      if (!binding[permKey]) throw new HttpError(403, 'OPERATION_NOT_ALLOWED', 'Operation is not allowed for this guest');

      await touchGrant(db, grant.grant_id);
      await touchLicense(db, license.id);
      await touchHost(db, grant.host_id);
      await log(db, {
        license_id: license.id, host_id: grant.host_id, guest_app_id: guest.id,
        event_type: 'GUEST_' + operation, result: 'ALLOW', request_id: requestId,
        ip_hash: ipHash, detail: operation + ' allowed for ' + guestPackage,
      });

      const domain = operation === 'LAUNCH' ? 'LAUNCH-TICKET'
        : operation === 'INSTALL' ? 'INSTALL-TICKET' : 'OP';
      const ticket = signPayload({
        ...ticketBase({
          ...grant,
          expires_at: license.expires_at || null,
          epoch: Number(license.epoch || grant.epoch || 1),
        }),
        ticket_id: generateTicketId(operation === 'LAUNCH' ? 'LT' : operation === 'INSTALL' ? 'IT' : 'OP'),
        operation,
        host: {
          package_name: grant.package_name,
          app_name: grant.app_name || '',
          cert_sha256: grant.cert_sha256 || '',
        },
        guest: {
          package_name: guestPackage,
          app_name: guestAppName || guest.app_name || '',
          apk_sha256: apkHash || guest.apk_sha256 || '',
          cert_sha256: grant.signature_bind ? guestCert : (guest.cert_sha256 || ''),
          version_code: versionCode || Number(guest.version_code || 0),
        },
        nonce,
      }, config, domain);

      const payload = signPayload({
        protocol: PROTOCOL,
        decision: 'ALLOW',
        code: 'AUTHORIZED',
        request_id: requestId,
        ticket,
        permissions: {
          launch: !!binding.can_launch,
          install: !!binding.can_install,
          update: !!binding.can_update,
          restart: !!binding.can_restart,
        },
        server_time: nowS(),
      }, config, 'RESPONSE');
      return await respond(payload, ctx, 200, { env, keys, headers: rateHeaders(rl) });
    }

    if (endpoint === '/status' && method === 'POST') {
      const read = await readPayload(request, env, endpoint, db, keys);
      ctx = read.ctx;
      const body = read.payload;
      const requestId = cleanRequestId(body.request_id);
      const license = await findLicenseByCredential(db, body.mak);
      if (!license) throw new HttpError(403, 'INVALID_LICENSE', 'Invalid MAK credential');
      const grant = await getGrantById(db, body.grant_id);
      if (!grant || Number(grant.license_id) !== Number(license.id)) {
        throw new HttpError(403, 'GRANT_MISMATCH', 'Grant does not belong to this MAK');
      }
      const problem = grantProblem(grant);
      const status = problem ? (problem === 'LICENSE_EXPIRED' ? 'EXPIRED' : 'REVOKED') : 'ACTIVE';
      const payload = signPayload({
        protocol: PROTOCOL,
        decision: problem ? 'DENY' : 'ALLOW',
        code: problem || 'ACTIVE',
        request_id: requestId,
        status,
        grant_id: grant.grant_id,
        epoch: Number(license.epoch || grant.epoch || 1),
        expires_at: license.expires_at || null,
        server_time: nowS(),
      }, config, 'STATUS');
      return await respond(payload, ctx, 200, { env, keys });
    }

    if (endpoint === '/deactivate' && method === 'POST') {
      const read = await readPayload(request, env, endpoint, db, keys);
      ctx = read.ctx;
      const body = read.payload;
      const requestId = cleanRequestId(body.request_id);
      const license = await findLicenseByCredential(db, body.mak);
      if (!license) throw new HttpError(403, 'INVALID_LICENSE', 'Invalid MAK credential');
      const grant = await getGrantById(db, body.grant_id);
      if (!grant || Number(grant.license_id) !== Number(license.id)) {
        throw new HttpError(403, 'GRANT_MISMATCH', 'Grant does not belong to this MAK');
      }
      await revokeGrant(db, grant.grant_id, 'client deactivate', 'CLIENT');
      const epoch = await bumpLicenseEpoch(db, license.id);
      const payload = signPayload({
        protocol: PROTOCOL, decision: 'ALLOW', code: 'DEACTIVATED',
        request_id: requestId, grant_id: grant.grant_id, epoch, server_time: nowS(),
      }, config, 'RESPONSE');
      return await respond(payload, ctx, 200, { env, keys });
    }

    throw new HttpError(404, 'NOT_FOUND', 'Unknown MAK/2 endpoint');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const code = err instanceof HttpError ? err.code : 'SERVER_ERROR';
    const message = err instanceof HttpError ? err.message : 'Activation service unavailable';
    if (status >= 500) console.error('mak2_request_failed', String(err && err.stack ? err.stack : err));
    const payload = signPayload({
      protocol: PROTOCOL, decision: 'DENY', code,
      request_id: randomId('REQ', 12), message, server_time: nowS(),
    }, config, 'ERROR');
    return await respond(payload, (err && err.ctx) || ctx, status, { env, keys });
  }
}
