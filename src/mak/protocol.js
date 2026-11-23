// MAK/1 public protocol — challenge, authorize, guest check, renew, heartbeat,
// client events, status, and the admin-only revoke endpoint.
//
// Every security decision is signed with Ed25519. Unknown keys, malformed
// bodies, replayed challenges and missing configuration fail closed.

import {
  PROTOCOL,
  b64encode,
  canonicalMak,
  deviceProofMessage,
  fingerprintDevicePublicKey,
  hashIp,
  loadSigningConfig,
  makHash,
  normalizeDevicePublicKey,
  normalizeHex64,
  nowS,
  randomId,
  sha256Hex,
  signPayload,
  signingPublicKeys,
  validPackageName,
  verifyDeviceProof,
} from './crypto.js';
import { getSettings } from './settings.js';
import { logEvent } from './events.js';
import {
  bindGuest,
  consumeChallenge,
  createChallenge,
  createSession,
  getBinding,
  getDeviceByLicenseKey,
  getGuestByIdentity,
  getHostForLicense,
  getLicenseByHash,
  getSession,
  findGuestByPackage,
  heartbeatSession,
  registerDeviceAtomic,
  renewSession,
  revokeDevice,
  revokeLicense,
  revokeSession,
  setLicenseStatus,
  touchDevice,
  touchHost,
  touchLicense,
  upsertHost,
} from './store.js';
import { clientIp, json, jsonBody } from './http.js';
import { getAdminSession, verifyCsrf } from './auth.js';
import { hitRate, rateHeaders } from './rate.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
  'Access-Control-Max-Age': '86400',
};

const OPS = ['INSTALL', 'LAUNCH', 'UPDATE', 'RESTART'];

function apiJson(obj, status = 200, extra = {}) {
  return json(obj, status, { ...CORS, ...extra });
}

function cleanRequestId(value) {
  const s = String(value || '').trim();
  if (/^[A-Za-z0-9._:-]{4,96}$/.test(s)) return s;
  return randomId('REQ', 12);
}

function requestTimestamp(value, skew) {
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  return Math.abs(nowS() - Math.floor(n)) <= skew;
}

function signed(config, payload) {
  return signPayload(payload, config, 'RESPONSE');
}

function unsignedServerError(message = 'Activation service unavailable') {
  return apiJson({
    protocol: PROTOCOL,
    decision: 'DENY',
    code: 'SERVER_ERROR',
    request_id: randomId('REQ', 12),
    permissions: { install: false, launch: false, update: false, restart: false },
    message,
    server_time: nowS(),
  }, 503);
}

function deny(config, code, requestId, message, status = 200) {
  const payload = {
    protocol: PROTOCOL,
    decision: 'DENY',
    code,
    request_id: requestId || randomId('REQ', 12),
    permissions: { install: false, launch: false, update: false, restart: false },
    server_time: nowS(),
  };
  if (message) payload.message = message;
  return apiJson(signed(config, payload), status);
}

function isLicenseUsable(license, now = nowS()) {
  if (!license) return 'INVALID_LICENSE';
  if (String(license.status).toUpperCase() === 'REVOKED') return 'LICENSE_REVOKED';
  if (String(license.status).toUpperCase() === 'SUSPENDED') return 'LICENSE_SUSPENDED';
  if (license.expires_at && Number(license.expires_at) <= now) return 'LICENSE_EXPIRED';
  return '';
}

function sessionProblem(s, now = nowS()) {
  if (!s) return { code: 'SESSION_EXPIRED', message: 'Unknown session' };
  if (s.revoked_at || String(s.session_status).toUpperCase() === 'REVOKED') return { code: 'SESSION_REVOKED', message: 'Session revoked' };
  if (String(s.session_status).toUpperCase() !== 'ACTIVE') return { code: 'SESSION_REVOKED', message: 'Session is not active' };
  if (Number(s.expires_at) <= now) return { code: 'SESSION_EXPIRED', message: 'Session expired' };
  const lic = isLicenseUsable({ status: s.license_status, expires_at: s.license_expires_at }, now);
  if (lic) return { code: lic, message: 'License is not active' };
  if (String(s.device_status).toUpperCase() !== 'ACTIVE') return { code: 'DEVICE_MISMATCH', message: 'Device is not authorized' };
  if (s.host_status && String(s.host_status).toUpperCase() !== 'ACTIVE') return { code: 'HOST_PACKAGE_MISMATCH', message: 'Host is suspended' };
  return null;
}

function proofFieldsFromDevice(device) {
  return {
    publicKey: String(device?.public_key || '').trim(),
    proof: String(device?.proof || '').trim(),
    timestamp: Number(device?.timestamp || 0),
  };
}

async function verifySessionDeviceProof({ db, session, device, kind, fields, requireProof, skew = 300 }) {
  const d = proofFieldsFromDevice(device);
  if (!d.publicKey || !d.proof || !d.timestamp) {
    return requireProof ? { ok: false, code: 'INVALID_DEVICE_PROOF' } : { ok: true, skipped: true };
  }
  if (Math.abs(nowS() - d.timestamp) > Math.max(30, Number(skew) || 300)) {
    return { ok: false, code: 'RESPONSE_EXPIRED' };
  }
  const norm = normalizeDevicePublicKey(d.publicKey);
  if (!norm.ok) return { ok: false, code: 'INVALID_DEVICE_PROOF' };
  if (norm.storage !== session.public_key) return { ok: false, code: 'DEVICE_MISMATCH' };
  const msg = deviceProofMessage(kind, [...fields, d.publicKey, d.timestamp]);
  const verified = await verifyDeviceProof(d.publicKey, msg, d.proof);
  return verified.ok ? { ok: true, normalized: norm } : { ok: false, code: 'INVALID_DEVICE_PROOF' };
}

export async function handleMak(request, env, db) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (!path.startsWith('/mak/v1')) return null;
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'Cache-Control': 'no-store' } });
  }

  const config = loadSigningConfig(env);
  const settings = await getSettings(db);
  const ip = clientIp(request);
  const ipHash = await hashIp(ip, env);
  const endpoint = path.slice('/mak/v1'.length) || '/';

  // Public status is always available, even while the server is OFF, so
  // operators can see why clients are being denied.
  if ((endpoint === '/status' || endpoint === '/health') && method === 'GET') {
    const payload = {
      protocol: PROTOCOL,
      service: String(env.MAK_SERVER_NAME || 'MUNDO Activation'),
      version: settings.server_version,
      server_enabled: settings.server_enabled,
      signing_ready: !!config.ok,
      key_id: config.ok ? config.active.key_id : null,
      public_keys: signingPublicKeys(config),
      signature_alg: 'Ed25519',
      device_key_alg: 'ECDSA-P256',
      transport: 'TLS 1.3',
      heartbeat_interval: settings.heartbeat_interval,
      session_ttl: settings.session_ttl,
      challenge_ttl: settings.challenge_ttl,
      server_time: nowS(),
    };
    return apiJson(config.ok ? signed(config, payload) : { ...payload, decision: 'INFO', permissions: {} });
  }

  if (!config.ok) return unsignedServerError();
  if (!settings.server_enabled) {
    return deny(config, 'SERVER_DISABLED', null, settings.maintenance_message, 503);
  }

  // -------------------------------------------------------------------------
  // Challenge
  // -------------------------------------------------------------------------
  if (endpoint === '/challenge' && method === 'POST') {
    const rl = hitRate('mak:challenge:' + ip, 90, 60_000);
    if (!rl.allowed) return deny(config, 'SERVER_ERROR', null, 'Too many challenge requests', 429);
    let body;
    try { body = await jsonBody(request); } catch { return deny(config, 'UNKNOWN_ERROR', null, 'Invalid JSON body', 400); }
    if (String(body.protocol || PROTOCOL) !== PROTOCOL) return deny(config, 'UNKNOWN_ERROR', cleanRequestId(body.request_id), 'Unsupported protocol', 400);

    const now = nowS();
    const challengeId = randomId('CH', 18);
    const nonce = randomId('', 32);
    const expiresAt = now + Math.max(15, Math.min(300, settings.challenge_ttl));
    await createChallenge(db, {
      id: challengeId,
      nonce_hash: await sha256Hex('MAK-CHALLENGE|' + nonce),
      expires_at: expiresAt,
      ip_hash: ipHash,
    });
    const payload = {
      protocol: PROTOCOL,
      challenge_id: challengeId,
      nonce,
      expires_at: expiresAt,
      server_time: now,
      heartbeat_interval: settings.heartbeat_interval,
      session_ttl: settings.session_ttl,
      challenge_ttl: settings.challenge_ttl,
    };
    return apiJson(signed(config, payload), 200, rateHeaders(rl));
  }

  // -------------------------------------------------------------------------
  // Authorize (host + device + license)
  // -------------------------------------------------------------------------
  if (endpoint === '/authorize' && method === 'POST') {
    const rl = hitRate('mak:authorize:' + ip, 45, 60_000);
    if (!rl.allowed) return deny(config, 'SERVER_ERROR', null, 'Too many authorization attempts', 429);
    let body;
    try { body = await jsonBody(request); } catch { return deny(config, 'UNKNOWN_ERROR', null, 'Invalid JSON body', 400); }
    const requestId = cleanRequestId(body.request_id);
    if (String(body.protocol || '') !== PROTOCOL) return deny(config, 'UNKNOWN_ERROR', requestId, 'Unsupported protocol', 400);

    const now = nowS();
    const challengeId = String(body.challenge_id || '');
    const nonce = String(body.nonce || '');
    const licenseCredential = String(body.license?.credential || '');
    const host = body.host && typeof body.host === 'object' ? body.host : {};
    const device = body.device && typeof body.device === 'object' ? body.device : {};
    const hostPackage = String(host.package_name || '').trim();
    const hostCertRaw = String(host.signing_cert_sha256 || '').trim();
    const hostCert = normalizeHex64(hostCertRaw);
    const timestamp = Number(body.timestamp || 0);

    if (!challengeId || !nonce) return deny(config, 'CHALLENGE_EXPIRED', requestId, 'Challenge id and nonce are required', 400);
    if (!requestTimestamp(timestamp, settings.clock_skew)) {
      await logEvent(db, { event_type: 'AUTH_FAIL', result: 'DENY', error_code: 'RESPONSE_EXPIRED', request_id: requestId, ip_hash: ipHash, detail: 'Request timestamp outside allowed window' });
      return deny(config, 'RESPONSE_EXPIRED', requestId, 'Request timestamp outside allowed window', 401);
    }
    if (!validPackageName(hostPackage)) return deny(config, 'HOST_PACKAGE_MISMATCH', requestId, 'Invalid host package', 403);
    if (!hostCert) return deny(config, 'HOST_CERT_MISMATCH', requestId, 'Invalid host signing certificate hash', 403);

    const canonicalCredential = canonicalMak(licenseCredential);
    if (!canonicalCredential) {
      await logEvent(db, { event_type: 'AUTH_FAIL', result: 'DENY', error_code: 'INVALID_LICENSE', request_id: requestId, ip_hash: ipHash, detail: 'Malformed MAK credential' });
      return deny(config, 'INVALID_LICENSE', requestId, 'Invalid MAK credential', 403);
    }
    const license = await getLicenseByHash(db, await makHash(canonicalCredential));
    if (!license) {
      await logEvent(db, { event_type: 'AUTH_FAIL', result: 'DENY', error_code: 'INVALID_LICENSE', request_id: requestId, ip_hash: ipHash, detail: 'Unknown MAK credential' });
      return deny(config, 'INVALID_LICENSE', requestId, 'Invalid MAK credential', 403);
    }

    const challengeResult = await consumeChallenge(db, challengeId, await sha256Hex('MAK-CHALLENGE|' + nonce));
    if (!challengeResult.ok) {
      await logEvent(db, { license_id: license.id, event_type: 'AUTH_FAIL', result: 'DENY', error_code: challengeResult.reason, request_id: requestId, ip_hash: ipHash, detail: 'Challenge rejected' });
      return deny(config, challengeResult.reason, requestId, challengeResult.reason === 'NONCE_REPLAY' ? 'Challenge already used' : 'Challenge expired', 409);
    }

    const licenseProblem = isLicenseUsable(license, now);
    if (licenseProblem) {
      await logEvent(db, { license_id: license.id, event_type: 'AUTH_FAIL', result: 'DENY', error_code: licenseProblem, request_id: requestId, ip_hash: ipHash, detail: 'License rejected' });
      return deny(config, licenseProblem, requestId, 'License is not active', 403);
    }

    // Device proof is checked before any host or device state is pinned to the
    // license, so a leaked MAK alone cannot steal the host binding.
    const deviceKeyRaw = String(device.public_key || '').trim();
    const proof = String(device.proof || '').trim();
    const norm = normalizeDevicePublicKey(deviceKeyRaw);
    if (!norm.ok || !proof) {
      await logEvent(db, { license_id: license.id, event_type: 'AUTH_FAIL', result: 'DENY', error_code: 'INVALID_DEVICE_PROOF', request_id: requestId, ip_hash: ipHash, detail: 'Missing or malformed device proof' });
      return deny(config, 'INVALID_DEVICE_PROOF', requestId, 'Device proof is required', 403);
    }
    const proofMessage = deviceProofMessage('AUTHORIZE', [
      challengeId, nonce, hostPackage, hostCert, deviceKeyRaw, timestamp,
    ]);
    const proofResult = await verifyDeviceProof(deviceKeyRaw, proofMessage, proof);
    if (!proofResult.ok) {
      await logEvent(db, { license_id: license.id, event_type: 'AUTH_FAIL', result: 'DENY', error_code: 'INVALID_DEVICE_PROOF', request_id: requestId, ip_hash: ipHash, detail: 'Device signature verification failed' });
      return deny(config, 'INVALID_DEVICE_PROOF', requestId, 'Device signature verification failed', 403);
    }

    // Host binding: strict pre-registration, or cryptographically authenticated
    // first-use binding. Later requests must always match the stored host.
    let hostRow = await getHostForLicense(db, license.id);
    if (hostRow) {
      if (String(hostRow.status).toUpperCase() !== 'ACTIVE') {
        await logEvent(db, { license_id: license.id, host_id: hostRow.id, event_type: 'AUTH_FAIL', result: 'DENY', error_code: 'HOST_PACKAGE_MISMATCH', request_id: requestId, ip_hash: ipHash, detail: 'Host binding suspended' });
        return deny(config, 'HOST_PACKAGE_MISMATCH', requestId, 'Host binding is suspended', 403);
      }
      if (String(hostRow.package_name) !== hostPackage) {
        await logEvent(db, { license_id: license.id, host_id: hostRow.id, event_type: 'AUTH_FAIL', result: 'DENY', error_code: 'HOST_PACKAGE_MISMATCH', request_id: requestId, ip_hash: ipHash, detail: 'Host package mismatch' });
        return deny(config, 'HOST_PACKAGE_MISMATCH', requestId, 'Host package mismatch', 403);
      }
      if (String(hostRow.cert_sha256).toLowerCase() !== hostCert) {
        await logEvent(db, { license_id: license.id, host_id: hostRow.id, event_type: 'AUTH_FAIL', result: 'DENY', error_code: 'HOST_CERT_MISMATCH', request_id: requestId, ip_hash: ipHash, detail: 'Host certificate mismatch' });
        return deny(config, 'HOST_CERT_MISMATCH', requestId, 'Host signing certificate mismatch', 403);
      }
    } else {
      if (String(license.host_bind_mode).toUpperCase() === 'STRICT') {
        await logEvent(db, { license_id: license.id, event_type: 'AUTH_FAIL', result: 'DENY', error_code: 'HOST_PACKAGE_MISMATCH', request_id: requestId, ip_hash: ipHash, detail: 'Strict host binding has no registered host' });
        return deny(config, 'HOST_PACKAGE_MISMATCH', requestId, 'No host is registered for this license', 403);
      }
      hostRow = await upsertHost(db, license.id, { package_name: hostPackage, cert_sha256: hostCert });
      await logEvent(db, { license_id: license.id, host_id: hostRow?.id, event_type: 'HOST_BOUND', result: 'SUCCESS', request_id: requestId, ip_hash: ipHash, detail: 'Host bound on first authenticated use' });
    }

    const fingerprint = await fingerprintDevicePublicKey(norm);
    let deviceRow = await getDeviceByLicenseKey(db, license.id, norm.storage);
    if (deviceRow && String(deviceRow.status).toUpperCase() !== 'ACTIVE') {
      await logEvent(db, { license_id: license.id, device_id: deviceRow.id, event_type: 'AUTH_FAIL', result: 'DENY', error_code: 'DEVICE_MISMATCH', request_id: requestId, ip_hash: ipHash, detail: 'Device is revoked' });
      return deny(config, 'DEVICE_MISMATCH', requestId, 'Device is not authorized', 403);
    }
    if (!deviceRow) {
      const registration = await registerDeviceAtomic(db, license.id, norm.storage, fingerprint);
      if (!registration.ok) {
        await logEvent(db, { license_id: license.id, event_type: 'AUTH_FAIL', result: 'DENY', error_code: registration.code, request_id: requestId, ip_hash: ipHash, detail: 'Device registration rejected' });
        return deny(config, registration.code, requestId,
          registration.code === 'ACTIVATION_LIMIT_REACHED' ? 'Activation limit reached' : 'Device limit reached', 403);
      }
      deviceRow = registration.device;
      await logEvent(db, { license_id: license.id, device_id: deviceRow.id, host_id: hostRow?.id, event_type: 'DEVICE_REGISTERED', result: 'SUCCESS', request_id: requestId, ip_hash: ipHash, detail: 'Device registered: ' + fingerprint });
    } else {
      await touchDevice(db, deviceRow.id);
    }

    const ttl = Math.max(60, Math.min(86400, Number(license.session_ttl) || settings.session_ttl));
    let session = await createSession(db, {
      licenseId: license.id,
      deviceId: deviceRow.id,
      hostId: hostRow?.id,
      ttl,
      requestId,
      ipHash,
    });
    if (license.expires_at && Number(session.expires_at) > Number(license.expires_at)) {
      await db.prepare('UPDATE mak_sessions SET expires_at=? WHERE id=?').bind(Number(license.expires_at), session.id).run();
      session.expires_at = Number(license.expires_at);
    }

    await touchLicense(db, license.id);
    if (hostRow) await touchHost(db, license.id);
    await logEvent(db, { license_id: license.id, device_id: deviceRow.id, host_id: hostRow?.id, event_type: 'AUTH_SUCCESS', result: 'ALLOW', request_id: requestId, ip_hash: ipHash, detail: 'Host and device authorized' });

    const payload = {
      protocol: PROTOCOL,
      decision: 'ALLOW',
      code: 'AUTHORIZED',
      request_id: requestId,
      license: { license_uid: license.license_uid, expires_at: license.expires_at || null },
      session: { session_id: session.id, issued_at: session.issued_at, expires_at: session.expires_at },
      host: { package_name: hostPackage, signing_cert_sha256: hostCert },
      permissions: { install: false, launch: false, update: false, restart: false },
      challenge: nonce,
      server_time: now,
      heartbeat_interval: settings.heartbeat_interval,
    };
    return apiJson(signed(config, payload), 200, rateHeaders(rl));
  }

  // -------------------------------------------------------------------------
  // Guest operation authorization
  // -------------------------------------------------------------------------
  if (endpoint === '/guest/check' && method === 'POST') {
    const rl = hitRate('mak:guest:' + ip, 120, 60_000);
    if (!rl.allowed) return deny(config, 'SERVER_ERROR', null, 'Too many guest requests', 429);
    let body;
    try { body = await jsonBody(request); } catch { return deny(config, 'UNKNOWN_ERROR', null, 'Invalid JSON body', 400); }
    const requestId = cleanRequestId(body.request_id);
    if (String(body.protocol || '') !== PROTOCOL) return deny(config, 'UNKNOWN_ERROR', requestId, 'Unsupported protocol', 400);
    const operation = String(body.operation || '').toUpperCase();
    if (!OPS.includes(operation)) return deny(config, 'UNKNOWN_ERROR', requestId, 'Unsupported operation', 400);
    const sessionId = String(body.session_id || '');
    const session = await getSession(db, sessionId);
    const problem = sessionProblem(session);
    if (problem) {
      await logEvent(db, { license_id: session?.license_id, device_id: session?.device_id, event_type: 'GUEST_CHECK', result: 'DENY', error_code: problem.code, request_id: requestId, ip_hash: ipHash, detail: problem.message });
      return deny(config, problem.code, requestId, problem.message, problem.code === 'SESSION_EXPIRED' ? 401 : 403);
    }

    const guestInput = body.guest && typeof body.guest === 'object' ? body.guest : {};
    const guestPackage = String(guestInput.package_name || '').trim();
    const guestAppName = String(guestInput.app_name || '').trim();
    const apkHash = normalizeHex64(guestInput.apk_sha256);
    const guestCert = normalizeHex64(guestInput.signing_cert_sha256);
    const versionCode = Number(guestInput.version_code || 0);
    if (!validPackageName(guestPackage) || !apkHash || !guestCert || !Number.isFinite(versionCode) || versionCode < 0) {
      await logEvent(db, { license_id: session.license_id, device_id: session.device_id, event_type: 'GUEST_CHECK', result: 'DENY', error_code: 'APK_INVALID', request_id: requestId, ip_hash: ipHash, detail: 'Malformed guest identity' });
      return deny(config, 'APK_INVALID', requestId, 'Guest identity is malformed', 400);
    }

    const proofCheck = await verifySessionDeviceProof({
      db,
      session,
      device: body.device,
      kind: 'GUEST_CHECK',
      fields: [sessionId, operation, guestPackage, apkHash, guestCert, versionCode],
      requireProof: settings.guest_proof_required,
      skew: settings.clock_skew,
    });
    if (!proofCheck.ok) {
      await logEvent(db, { license_id: session.license_id, device_id: session.device_id, event_type: 'GUEST_CHECK', result: 'DENY', error_code: proofCheck.code, request_id: requestId, ip_hash: ipHash, detail: 'Device proof rejected for guest operation' });
      return deny(config, proofCheck.code, requestId, proofCheck.code === 'DEVICE_MISMATCH' ? 'Device does not own this session' : 'Invalid device proof', 403);
    }

    let guest = await getGuestByIdentity(db, {
      package_name: guestPackage,
      apk_sha256: apkHash,
      cert_sha256: guestCert,
      version_code: versionCode,
    });
    if (!guest) {
      const rows = await findGuestByPackage(db, guestPackage);
      let code = 'GUEST_PACKAGE_MISMATCH';
      let message = 'Guest package is not approved';
      if (rows.length) {
        if (!rows.some((r) => String(r.cert_sha256).toLowerCase() === guestCert)) {
          code = 'GUEST_CERT_MISMATCH';
          message = 'Guest signing certificate is not approved';
        } else if (!rows.some((r) => String(r.apk_sha256).toLowerCase() === apkHash)) {
          code = 'GUEST_HASH_MISMATCH';
          message = 'Guest APK hash is not approved';
        } else {
          code = 'APK_INVALID';
          message = 'Guest version is not approved';
        }
      }
      await logEvent(db, { license_id: session.license_id, device_id: session.device_id, event_type: 'GUEST_CHECK', result: 'DENY', error_code: code, request_id: requestId, ip_hash: ipHash, detail: message });
      return deny(config, code, requestId, message, 403);
    }
    if (String(guest.status).toUpperCase() !== 'ACTIVE') {
      await logEvent(db, { license_id: session.license_id, guest_app_id: guest.id, event_type: 'GUEST_CHECK', result: 'DENY', error_code: 'GUEST_PACKAGE_MISMATCH', request_id: requestId, ip_hash: ipHash, detail: 'Guest application is suspended' });
      return deny(config, 'GUEST_PACKAGE_MISMATCH', requestId, 'Guest application is suspended', 403);
    }
    const binding = await getBinding(db, session.license_id, guest.id);
    if (!binding || String(binding.status).toUpperCase() !== 'ACTIVE') {
      await logEvent(db, { license_id: session.license_id, guest_app_id: guest.id, event_type: 'GUEST_CHECK', result: 'DENY', error_code: 'GUEST_PACKAGE_MISMATCH', request_id: requestId, ip_hash: ipHash, detail: 'Guest is not bound to this license' });
      return deny(config, 'GUEST_PACKAGE_MISMATCH', requestId, 'Guest is not bound to this license', 403);
    }
    const permKey = { INSTALL: 'can_install', LAUNCH: 'can_launch', UPDATE: 'can_update', RESTART: 'can_restart' }[operation];
    if (!binding[permKey]) {
      await logEvent(db, { license_id: session.license_id, guest_app_id: guest.id, event_type: 'GUEST_CHECK', result: 'DENY', error_code: 'OPERATION_NOT_ALLOWED', request_id: requestId, ip_hash: ipHash, detail: operation + ' permission denied' });
      return deny(config, 'OPERATION_NOT_ALLOWED', requestId, `${operation} is not allowed for this guest`, 403);
    }

    const now = nowS();
    const authExpires = now + Math.max(30, Math.min(600, settings.authorization_ttl));
    const permissions = { install: false, launch: false, update: false, restart: false };
    permissions[operation.toLowerCase()] = true;
    const payload = {
      protocol: PROTOCOL,
      decision: 'ALLOW',
      code: 'AUTHORIZED',
      request_id: requestId,
      operation,
      session: { session_id: session.session_id, issued_at: session.issued_at, expires_at: session.expires_at },
      host: { package_name: session.host_package, signing_cert_sha256: session.host_cert_sha256 },
      guest: {
        package_name: guest.package_name,
        app_name: guestAppName || guest.app_name || '',
        apk_sha256: guest.apk_sha256,
        signing_cert_sha256: guest.cert_sha256,
        version_code: guest.version_code,
      },
      permissions,
      issued_at: now,
      expires_at: authExpires,
      server_time: now,
    };
    await logEvent(db, { license_id: session.license_id, device_id: session.device_id, host_id: session.host_id, guest_app_id: guest.id, event_type: 'GUEST_CHECK', result: 'ALLOW', request_id: requestId, ip_hash: ipHash, detail: operation + ' authorized' });
    return apiJson(signed(config, payload), 200, rateHeaders(rl));
  }

  // -------------------------------------------------------------------------
  // Renew + heartbeat (device proof required)
  // -------------------------------------------------------------------------
  if ((endpoint === '/renew' || endpoint === '/heartbeat') && method === 'POST') {
    const isRenew = endpoint === '/renew';
    const rl = hitRate('mak:' + (isRenew ? 'renew' : 'heartbeat') + ':' + ip, isRenew ? 30 : 180, 60_000);
    if (!rl.allowed) return deny(config, 'SERVER_ERROR', null, 'Too many requests', 429);
    let body;
    try { body = await jsonBody(request); } catch { return deny(config, 'UNKNOWN_ERROR', null, 'Invalid JSON body', 400); }
    const requestId = cleanRequestId(body.request_id);
    if (String(body.protocol || '') !== PROTOCOL) return deny(config, 'UNKNOWN_ERROR', requestId, 'Unsupported protocol', 400);
    const sessionId = String(body.session_id || '');
    const session = await getSession(db, sessionId);
    const problem = sessionProblem(session);
    if (problem) {
      await logEvent(db, { license_id: session?.license_id, device_id: session?.device_id, event_type: isRenew ? 'RENEW' : 'HEARTBEAT', result: 'DENY', error_code: problem.code, request_id: requestId, ip_hash: ipHash, detail: problem.message });
      return deny(config, problem.code, requestId, problem.message, problem.code === 'SESSION_EXPIRED' ? 401 : 403);
    }
    const proofCheck = await verifySessionDeviceProof({
      db,
      session,
      device: body.device,
      kind: isRenew ? 'RENEW' : 'HEARTBEAT',
      fields: [sessionId],
      requireProof: true,
      skew: settings.clock_skew,
    });
    if (!proofCheck.ok) {
      await logEvent(db, { license_id: session.license_id, device_id: session.device_id, event_type: isRenew ? 'RENEW' : 'HEARTBEAT', result: 'DENY', error_code: proofCheck.code, request_id: requestId, ip_hash: ipHash, detail: 'Device proof rejected' });
      return deny(config, proofCheck.code, requestId, proofCheck.code === 'DEVICE_MISMATCH' ? 'Device does not own this session' : 'Invalid device proof', 403);
    }

    const now = nowS();
    if (isRenew) {
      const ttl = Math.max(60, Math.min(86400, Number(session.session_ttl) || settings.session_ttl));
      let expires = now + ttl;
      if (session.license_expires_at && Number(session.license_expires_at) < expires) expires = Number(session.license_expires_at);
      if (expires <= now) return deny(config, 'LICENSE_EXPIRED', requestId, 'License expired', 403);
      await renewSession(db, sessionId, expires);
      await heartbeatSession(db, sessionId);
      await touchLicense(db, session.license_id);
      await touchDevice(db, session.device_id);
      await logEvent(db, { license_id: session.license_id, device_id: session.device_id, event_type: 'RENEW', result: 'ALLOW', request_id: requestId, ip_hash: ipHash, detail: 'Session renewed' });
      return apiJson(signed(config, {
        protocol: PROTOCOL,
        decision: 'ALLOW',
        code: 'RENEWED',
        request_id: requestId,
        session: { session_id: sessionId, issued_at: session.issued_at, expires_at: expires },
        host: { package_name: session.host_package, signing_cert_sha256: session.host_cert_sha256 },
        permissions: { install: false, launch: false, update: false, restart: false },
        server_time: now,
        heartbeat_interval: settings.heartbeat_interval,
      }), 200, rateHeaders(rl));
    }

    await heartbeatSession(db, sessionId);
    await touchDevice(db, session.device_id);
    await touchHost(db, session.license_id);
    return apiJson(signed(config, {
      protocol: PROTOCOL,
      decision: 'ALLOW',
      code: 'ALIVE',
      request_id: requestId,
      session: { session_id: sessionId, issued_at: session.issued_at, expires_at: session.expires_at },
      permissions: { install: false, launch: false, update: false, restart: false },
      server_time: now,
      heartbeat_interval: settings.heartbeat_interval,
    }), 200, rateHeaders(rl));
  }

  // -------------------------------------------------------------------------
  // Client security event ingest
  // -------------------------------------------------------------------------
  if (endpoint === '/events' && method === 'POST') {
    const rl = hitRate('mak:events:' + ip, 60, 60_000);
    if (!rl.allowed) return deny(config, 'SERVER_ERROR', null, 'Too many events', 429);
    let body;
    try { body = await jsonBody(request); } catch { return deny(config, 'UNKNOWN_ERROR', null, 'Invalid JSON body', 400); }
    const requestId = cleanRequestId(body.request_id);
    if (String(body.protocol || '') !== PROTOCOL) return deny(config, 'UNKNOWN_ERROR', requestId, 'Unsupported protocol', 400);
    const session = await getSession(db, String(body.session_id || ''));
    if (!session) return deny(config, 'SESSION_EXPIRED', requestId, 'Unknown session', 401);
    const eventType = String(body.event_type || '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 64);
    if (!eventType) return deny(config, 'UNKNOWN_ERROR', requestId, 'event_type is required', 400);
    const errorCode = String(body.error_code || '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 64);
    const detail = String(body.detail || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 500);
    await logEvent(db, {
      license_id: session.license_id,
      device_id: session.device_id,
      host_id: session.host_id,
      event_type: 'NATIVE_' + eventType,
      result: errorCode ? 'ERROR' : 'INFO',
      error_code: errorCode,
      detail,
      request_id: requestId,
      ip_hash: ipHash,
    });
    return apiJson(signed(config, {
      protocol: PROTOCOL,
      decision: 'ALLOW',
      code: 'EVENT_RECORDED',
      request_id: requestId,
      server_time: nowS(),
    }), 200, rateHeaders(rl));
  }

  // -------------------------------------------------------------------------
  // Admin-only revoke endpoint (panel cookie + CSRF header)
  // -------------------------------------------------------------------------
  if (endpoint === '/revoke' && method === 'POST') {
    const admin = await getAdminSession(db, request);
    if (!admin) return apiJson({ ok: false, error: 'UNAUTHORIZED' }, 401);
    if (!verifyCsrf(admin, request.headers.get('X-CSRF-Token') || '')) return apiJson({ ok: false, error: 'CSRF_REJECTED' }, 403);
    let body;
    try { body = await jsonBody(request); } catch { return apiJson({ ok: false, error: 'INVALID_JSON' }, 400); }
    const type = String(body.target_type || '').toLowerCase();
    const id = String(body.target_id || '');
    const reason = String(body.reason || 'Administrative revocation');
    if (!id) return apiJson({ ok: false, error: 'TARGET_REQUIRED' }, 400);
    if (type === 'license') {
      const license = await db.prepare('SELECT * FROM mak_licenses WHERE id=? OR license_uid=?').bind(Number(id) || 0, id).first().catch(() => null);
      if (!license) return apiJson({ ok: false, error: 'NOT_FOUND' }, 404);
      await revokeLicense(db, license.id, reason, admin.username);
    } else if (type === 'device') {
      const device = await revokeDevice(db, Number(id) || 0, reason, admin.username);
      if (!device) return apiJson({ ok: false, error: 'NOT_FOUND' }, 404);
    } else if (type === 'session') {
      const ok = await revokeSession(db, id, reason, admin.username);
      if (!ok) return apiJson({ ok: false, error: 'NOT_FOUND' }, 404);
    } else {
      return apiJson({ ok: false, error: 'UNSUPPORTED_TARGET' }, 400);
    }
    await logEvent(db, { event_type: 'ADMIN_REVOKE', result: 'SUCCESS', detail: `${type}:${id} — ${reason}`, actor: admin.username, ip_hash: ipHash });
    return apiJson({ ok: true, revoked: { type, id } });
  }

  return apiJson({ protocol: PROTOCOL, decision: 'DENY', code: 'UNKNOWN_ERROR', message: 'Unknown MAK endpoint' }, 404);
}
