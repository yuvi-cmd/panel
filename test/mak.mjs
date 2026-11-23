// Local verification: crypto primitives, admin auth, UI mutations, and a full
// MAK/1 host + guest + revocation flow against an in-memory D1-compatible DB.
// Run with: npm test

import assert from 'node:assert/strict';
import { MemoryD1 } from './d1.mjs';
import {
  b64encode, canonicalJson, canonicalMak, deviceProofMessage, generateMak,
  loadSigningConfig, makHash, normalizeDevicePublicKey, nowS, signPayload,
  verifyDeviceProof, verifyPassword, verifySignedPayload, hashPassword,
} from '../src/mak/crypto.js';
import app from '../src/index.js';

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('  ok  ' + name);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.error('FAIL  ' + name);
    console.error(err && err.stack ? err.stack : err);
  }
}

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function makeEnv(overrides = {}) {
  const seed = new Uint8Array(32);
  for (let i = 0; i < seed.length; i++) seed[i] = (i * 7 + 11) & 255;
  return {
    DB: new MemoryD1(),
    PANEL_CODE: 'YUVI_001',
    PANEL_NAME: 'Test Panel',
    MAK_SERVER_NAME: 'Test Activation',
    MAK_SIGNING_KEY: b64(seed),
    MAK_SIGNING_KEY_ID: 'TEST-ED25519-01',
    IP_HASH_SALT: 'test-salt',
    ...overrides,
  };
}

function form(data) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(data || {})) {
    if (Array.isArray(value)) value.forEach((v) => sp.append(key, String(v)));
    else if (value !== undefined && value !== null) sp.append(key, String(value));
  }
  return sp.toString();
}

function request(env, path, { method = 'GET', cookie = '', body = '', json = null, origin = 'https://panel.test' } = {}) {
  const url = 'https://panel.test' + path;
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  let payload = body;
  if (json) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(json);
  } else if (method === 'POST' && !body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  return new Request(url, { method, headers, body: method === 'GET' ? undefined : payload });
}

async function call(env, path, opts) {
  return app.fetch(request(env, path, opts), env, {});
}

function setCookie(response) {
  const values = response.headers.getSetCookie();
  const cookies = values.map((v) => v.split(';')[0]).filter(Boolean);
  return cookies.join('; ');
}

function csrf(htmlText) {
  const m = /name="_csrf" value="([^"]+)"/.exec(htmlText);
  assert.ok(m, 'expected a CSRF token in the page');
  return m[1];
}

function futureDate(days = 30) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
    .format(new Date(Date.now() + days * 86400000));
}

function jsonBody(text) {
  return JSON.parse(text);
}

async function challenge(env) {
  const res = await call(env, '/mak/v1/challenge', {
    method: 'POST', json: { protocol: 'MAK/1', request_id: 'REQ_CHALLENGE_TEST' },
  });
  assert.equal(res.status, 200, await res.clone().text());
  return jsonBody(await res.text());
}

async function challengeStatus(env) {
  return call(env, '/mak/v1/challenge', {
    method: 'POST', json: { protocol: 'MAK/1', request_id: 'REQ_DISABLED_TEST' },
  });
}

async function makeDevice() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  const spki = b64encode(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)));
  const publicKeyValue = 'spki:' + spki;
  const norm = normalizeDevicePublicKey(publicKeyValue);
  assert.ok(norm.ok);
  const sign = async (message) => b64encode(new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(message)),
  ));
  return { pair, publicKeyValue, norm, sign };
}

async function authorize(env, {
  licenseCredential, device, hostPackage = 'com.test.host', hostCert = 'c'.repeat(64),
  hostAppName = '', deviceId = '', timestamp = nowS(),
}) {
  const c = await challenge(env);
  const proofMessage = deviceProofMessage('AUTHORIZE', [
    c.challenge_id, c.nonce, hostPackage, hostCert, device.publicKeyValue, timestamp,
  ]);
  const proof = await device.sign(proofMessage);
  const res = await call(env, '/mak/v1/authorize', {
    method: 'POST',
    json: {
      protocol: 'MAK/1',
      request_id: 'REQ_AUTH_TEST',
      challenge_id: c.challenge_id,
      nonce: c.nonce,
      timestamp,
      license: { credential: licenseCredential },
      host: { package_name: hostPackage, app_name: hostAppName, signing_cert_sha256: hostCert },
      device: { public_key: device.publicKeyValue, proof, timestamp, device_id: deviceId },
    },
  });
  const text = await res.text();
  return { response: jsonBody(text), challenge: c, status: res.status };
}

async function deviceProof(device, kind, fields) {
  return device.sign(deviceProofMessage(kind, fields));
}

async function sessionProof(device, kind, fields, deviceId = '') {
  const timestamp = nowS();
  const proof = await device.sign(deviceProofMessage(kind, [...fields, device.publicKeyValue, timestamp]));
  return { public_key: device.publicKeyValue, proof, timestamp, device_id: deviceId };
}

async function main() {
  console.log('\nMAK panel verification\n');

  await test('MAK format + canonicalisation', () => {
    const mak = generateMak();
    assert.match(mak, /^MAK-[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
    assert.equal(canonicalMak(mak.toLowerCase()), mak);
    assert.equal(canonicalMak(mak.replace(/-/g, '').toLowerCase()), mak);
    assert.equal(canonicalMak('MAK-123'), '');
  });

  await test('canonical JSON is stable and sorted', () => {
    assert.equal(canonicalJson({ b: 1, a: 'x', nested: { z: false, a: [2, 1] } }), '{"a":"x","b":1,"nested":{"a":[2,1],"z":false}}');
  });

  await test('MAK verifier is deterministic and does not embed the credential', async () => {
    const mak = generateMak();
    const h1 = await makHash(mak);
    const h2 = await makHash(mak);
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
    assert.ok(!h1.includes(mak.replace(/-/g, '').toLowerCase()));
  });

  await test('Ed25519 sign + verify + tamper rejection', () => {
    const config = loadSigningConfig({ MAK_SIGNING_KEY: makeEnv().MAK_SIGNING_KEY, MAK_SIGNING_KEY_ID: 'TEST-K1' });
    assert.equal(config.ok, true);
    const signed = signPayload({ protocol: 'MAK/1', decision: 'ALLOW', n: 1 }, config, 'RESPONSE');
    assert.equal(verifySignedPayload(signed, config, 'RESPONSE'), true);
    assert.equal(verifySignedPayload({ ...signed, decision: 'DENY' }, config, 'RESPONSE'), false);
    assert.equal(verifySignedPayload(signed, config, 'REQUEST'), false);
  });

  await test('password hashing verifies and rejects wrong passwords', async () => {
    const stored = await hashPassword('correct horse battery staple');
    assert.equal(await verifyPassword('correct horse battery staple', stored), true);
    assert.equal(await verifyPassword('wrong password', stored), false);
  });

  await test('ECDSA P-256 device proof (SPKI and raw encodings)', async () => {
    const device = await makeDevice();
    const msg = deviceProofMessage('AUTHORIZE', ['a', 'b', 1]);
    const sig = await device.sign(msg);
    assert.equal((await verifyDeviceProof(device.publicKeyValue, msg, sig)).ok, true);
    assert.equal((await verifyDeviceProof(device.publicKeyValue, msg + 'x', sig)).ok, false);
    const raw = b64encode(new Uint8Array(await crypto.subtle.exportKey('raw', device.pair.publicKey)));
    const rawNorm = normalizeDevicePublicKey('raw:' + raw);
    assert.equal(rawNorm.ok, true);
    assert.equal(rawNorm.storage, device.norm.storage);
  });

  await test('existing panel setup, MAK pages, license issuance and CSRF rejection', async () => {
    const env = globalThis.__lastEnv;
    const root = await call(env, '/');
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('Location'), '/setup');

    const setupPage = await call(env, '/setup');
    assert.equal(setupPage.status, 200);
    assert.match(await setupPage.text(), /Create|setup|Owner/i);

    const setup = await call(env, '/setup', {
      method: 'POST',
      body: form({ username: 'owner', password: 'supersecret123' }),
    });
    assert.equal(setup.status, 302, await setup.clone().text());
    assert.equal(setup.headers.get('Location'), '/dashboard');
    const cookie = setCookie(setup);
    assert.match(cookie, /sdk_session=/);

    const sdk = await call(env, '/sdk', { cookie });
    const sdkHtml = await sdk.text();
    assert.equal(sdk.status, 200);
    assert.match(sdkHtml, /MAK Activation/);

    const dash = await call(env, '/sdk/settings', { cookie });
    assert.equal(dash.status, 200);
    const dashHtml = await dash.text();
    assert.match(dashHtml, /MAK Keys/);
    assert.match(dashHtml, /Back to SDK Panel/);
    assert.match(dashHtml, /href="\/sdk\/keys"/);
    assert.doesNotMatch(dashHtml, /href="\/mak(?!\/v1)/);
    const token = csrf(dashHtml);

    const noCsrf = await call(env, '/sdk/settings/server', {
      method: 'POST', cookie, body: form({ action: 'save' }),
    });
    assert.equal(noCsrf.status, 403);

    const newPage = await call(env, '/sdk/generate', { cookie });
    assert.equal(newPage.status, 200);
    const newHtml = await newPage.text();
    assert.equal(csrf(newHtml), token);

    const issued = await call(env, '/sdk/generate', {
      method: 'POST',
      cookie,
      body: form({
        _csrf: token,
        label: 'Test License',
        user_ref: 'test-user',
        duration: '30',
        max_devices: '2',
        max_activations: '3',
        session_ttl: '3600',
        max_packages: '2',
        max_apps: '2',
        host_bind_mode: 'AUTO',
        notes: 'unit test',
      }),
    });
    assert.equal(issued.status, 200, await issued.clone().text());
    const issuedHtml = await issued.text();
    const makMatch = /MAK-[0-9A-HJKMNP-TV-Z]{5}(?:-[0-9A-HJKMNP-TV-Z]{5}){3}/.exec(issuedHtml);
    assert.ok(makMatch, 'raw MAK appears once on the reveal page');
    const license = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();
    assert.ok(license);
    assert.match(license.license_uid, /^LIC-/);
    assert.equal(license.credential_hash.length, 64);
    assert.notEqual(license.credential_hash, makMatch[0]);
    assert.equal(license.activation_count, 0);
    assert.equal(license.max_packages, 2);
    assert.equal(license.max_apps, 2);
    assert.equal(license.host_bind_mode, 'AUTO');

    const detail = await call(env, '/sdk/keys/' + license.id, { cookie });
    assert.equal(detail.status, 200);
    const detailHtml = await detail.text();
    assert.match(detailHtml, /Test License/);
    assert.match(detailHtml, new RegExp('/sdk/keys/' + license.id + '/action'));
    assert.doesNotMatch(detailHtml, /href="\/mak(?!\/v1)/);

    env.__test = { cookie, token, license, credential: makMatch[0], device: await makeDevice() };
  });

  await test('MAK/1 AUTO host + guest binding, per-package limits, device_id audit, renew, heartbeat', async () => {
    const env = globalThis.__lastEnv;
    assert.ok(env, 'previous test environment');
    const { license, credential, device } = env.__test;
    const config = loadSigningConfig(env);

    const auth = await authorize(env, {
      licenseCredential: credential, device, hostAppName: 'Test Host', deviceId: 'DEV-A',
    });
    assert.equal(auth.status, 200, JSON.stringify(auth.response));
    assert.equal(auth.response.decision, 'ALLOW');
    assert.equal(auth.response.code, 'AUTHORIZED');
    assert.equal(auth.response.host.app_name, 'Test Host');
    assert.equal(verifySignedPayload(auth.response, config, 'RESPONSE'), true, 'authorize response is signed');
    const session = auth.response.session.session_id;
    assert.ok(session);

    const hostRow = await env.DB.prepare('SELECT * FROM mak_hosts WHERE license_id=? ORDER BY id LIMIT 1').bind(license.id).first();
    assert.equal(hostRow.package_name, 'com.test.host');
    assert.equal(hostRow.app_name, 'Test Host');
    const deviceRow = await env.DB.prepare('SELECT * FROM mak_devices WHERE license_id=?').bind(license.id).first();
    assert.equal(deviceRow.status, 'ACTIVE');
    assert.equal(deviceRow.device_id, 'DEV-A');
    assert.match(deviceRow.fingerprint, /^SHA256:[0-9A-F]{64}$/);
    const licAfter = await env.DB.prepare('SELECT activation_count FROM mak_licenses WHERE id=?').bind(license.id).first();
    assert.equal(licAfter.activation_count, 1);

    // AUTO binds the first guest package on first use.
    const guestPackage = 'com.test.guest';
    const apkHash = 'a'.repeat(64);
    const guestCert = 'b'.repeat(64);
    const guestProof = await sessionProof(device, 'GUEST_CHECK', [session, 'LAUNCH', guestPackage, apkHash, guestCert, 1], 'DEV-A');
    const autoGuest = await call(env, '/mak/v1/guest/check', {
      method: 'POST',
      json: {
        protocol: 'MAK/1', request_id: 'REQ_GUEST_AUTO', session_id: session, operation: 'LAUNCH',
        guest: { package_name: guestPackage, app_name: 'Guest', apk_sha256: apkHash, signing_cert_sha256: guestCert, version_code: 1 },
        device: guestProof,
      },
    });
    const autoJson = jsonBody(await autoGuest.text());
    assert.equal(autoJson.decision, 'ALLOW', JSON.stringify(autoJson));
    assert.equal(autoJson.permissions.launch, true);
    assert.equal(verifySignedPayload(autoJson, config, 'RESPONSE'), true);
    const guest = await env.DB.prepare('SELECT * FROM mak_guest_apps WHERE package_name=? ORDER BY id DESC LIMIT 1').bind(guestPackage).first();
    assert.ok(guest);
    const binding = await env.DB.prepare('SELECT * FROM mak_bindings WHERE license_id=? AND host_id=? AND guest_app_id=?').bind(license.id, hostRow.id, guest.id).first();
    assert.ok(binding);
    assert.equal(binding.can_launch, 1);

    // A new version of the same package must not consume another app slot.
    const apkHashV2 = 'f'.repeat(64);
    const v2Proof = await sessionProof(device, 'GUEST_CHECK', [session, 'LAUNCH', guestPackage, apkHashV2, guestCert, 2], 'DEV-A');
    const v2 = await call(env, '/mak/v1/guest/check', {
      method: 'POST',
      json: {
        protocol: 'MAK/1', request_id: 'REQ_GUEST_V2', session_id: session, operation: 'LAUNCH',
        guest: { package_name: guestPackage, app_name: 'Guest', apk_sha256: apkHashV2, signing_cert_sha256: guestCert, version_code: 2 },
        device: v2Proof,
      },
    });
    assert.equal(jsonBody(await v2.text()).decision, 'ALLOW');
    const distinct = await env.DB.prepare(
      `SELECT COUNT(DISTINCT g.package_name) AS c FROM mak_bindings b JOIN mak_guest_apps g ON g.id=b.guest_app_id
        WHERE b.license_id=? AND b.host_id=? AND b.status='ACTIVE'`,
    ).bind(license.id, hostRow.id).first();
    assert.equal(distinct.c, 1);

    // Second distinct guest package fills the per-package limit.
    const guest2 = 'com.test.guest2';
    const proof2 = await sessionProof(device, 'GUEST_CHECK', [session, 'LAUNCH', guest2, '1'.repeat(64), guestCert, 1], 'DEV-A');
    const second = await call(env, '/mak/v1/guest/check', {
      method: 'POST',
      json: {
        protocol: 'MAK/1', request_id: 'REQ_GUEST_2', session_id: session, operation: 'LAUNCH',
        guest: { package_name: guest2, app_name: 'Guest 2', apk_sha256: '1'.repeat(64), signing_cert_sha256: guestCert, version_code: 1 },
        device: proof2,
      },
    });
    assert.equal(jsonBody(await second.text()).decision, 'ALLOW');

    // Third distinct guest package is rejected.
    const guest3 = 'com.test.guest3';
    const proof3 = await sessionProof(device, 'GUEST_CHECK', [session, 'LAUNCH', guest3, '2'.repeat(64), guestCert, 1], 'DEV-A');
    const third = await call(env, '/mak/v1/guest/check', {
      method: 'POST',
      json: {
        protocol: 'MAK/1', request_id: 'REQ_GUEST_3', session_id: session, operation: 'LAUNCH',
        guest: { package_name: guest3, app_name: 'Guest 3', apk_sha256: '2'.repeat(64), signing_cert_sha256: guestCert, version_code: 1 },
        device: proof3,
      },
    });
    const thirdJson = jsonBody(await third.text());
    assert.equal(thirdJson.decision, 'DENY');
    assert.equal(thirdJson.code, 'APP_LIMIT_REACHED');

    // A second host package is allowed. A changed device_id is audit-only.
    const auth2 = await authorize(env, {
      licenseCredential: credential, device, hostPackage: 'com.test.host2',
      hostCert: 'e'.repeat(64), hostAppName: 'Second Host', deviceId: 'DEV-B',
    });
    assert.equal(auth2.status, 200, JSON.stringify(auth2.response));
    assert.equal(auth2.response.decision, 'ALLOW');
    const mismatch = await env.DB.prepare(
      "SELECT * FROM mak_events WHERE license_id=? AND event_type='DEVICE_ID_MISMATCH' ORDER BY id DESC LIMIT 1",
    ).bind(license.id).first();
    assert.ok(mismatch, 'device_id change is logged');
    const deviceAfter = await env.DB.prepare('SELECT device_id FROM mak_devices WHERE license_id=?').bind(license.id).first();
    assert.equal(deviceAfter.device_id, 'DEV-B');

    // A third host package exceeds max_packages.
    const auth3 = await authorize(env, {
      licenseCredential: credential, device, hostPackage: 'com.test.host3', hostCert: '3'.repeat(64),
    });
    assert.equal(auth3.status, 403);
    assert.equal(auth3.response.decision, 'DENY');
    assert.equal(auth3.response.code, 'PACKAGE_LIMIT_REACHED');

    const heartbeatProof = await sessionProof(device, 'HEARTBEAT', [session], 'DEV-B');
    const heartbeat = await call(env, '/mak/v1/heartbeat', {
      method: 'POST',
      json: { protocol: 'MAK/1', request_id: 'REQ_HB', session_id: session, device: heartbeatProof },
    });
    const heartbeatJson = jsonBody(await heartbeat.text());
    assert.equal(heartbeatJson.decision, 'ALLOW');
    assert.equal(heartbeatJson.code, 'ALIVE');

    const renewProof = await sessionProof(device, 'RENEW', [session], 'DEV-B');
    const renew = await call(env, '/mak/v1/renew', {
      method: 'POST',
      json: { protocol: 'MAK/1', request_id: 'REQ_RENEW', session_id: session, device: renewProof },
    });
    const renewJson = jsonBody(await renew.text());
    assert.equal(renewJson.decision, 'ALLOW');
    assert.equal(renewJson.code, 'RENEWED');

    env.__test.session = session;
    env.__test.guest = guest;
    env.__test.hostRow = hostRow;
  });

  await test('MAK/1 MANUAL binding requires pre-registered host and guest', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token, device } = env.__test;
    const manualHost = 'com.manual.host';
    const manualCert = 'd'.repeat(64);

    const issued = await call(env, '/sdk/generate', {
      method: 'POST', cookie,
      body: form({
        _csrf: token, label: 'Manual License', duration: '30',
        max_devices: '1', max_activations: '2', session_ttl: '3600',
        max_packages: '1', max_apps: '2',
        host_package: manualHost, host_app_name: 'Manual Host', host_cert: manualCert,
        host_bind_mode: 'MANUAL',
      }),
    });
    assert.equal(issued.status, 200, await issued.clone().text());
    const mak = /MAK-[0-9A-HJKMNP-TV-Z]{5}(?:-[0-9A-HJKMNP-TV-Z]{5}){3}/.exec(await issued.text())[0];
    const manualLicense = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();
    assert.equal(manualLicense.host_bind_mode, 'MANUAL');

    const auth = await authorize(env, { licenseCredential: mak, device, hostPackage: manualHost, hostCert: manualCert });
    assert.equal(auth.status, 200, JSON.stringify(auth.response));
    const session = auth.response.session.session_id;

    const wrongHost = await authorize(env, {
      licenseCredential: mak, device, hostPackage: 'com.manual.other', hostCert: manualCert,
    });
    assert.equal(wrongHost.status, 403);
    assert.equal(wrongHost.response.code, 'HOST_PACKAGE_MISMATCH');

    const guestPackage = 'com.manual.guest';
    const apkHash = '4'.repeat(64);
    const guestCert = '5'.repeat(64);
    const denyProof = await sessionProof(device, 'GUEST_CHECK', [session, 'LAUNCH', guestPackage, apkHash, guestCert, 1]);
    const denied = await call(env, '/mak/v1/guest/check', {
      method: 'POST',
      json: {
        protocol: 'MAK/1', request_id: 'REQ_MANUAL_DENY', session_id: session, operation: 'LAUNCH',
        guest: { package_name: guestPackage, app_name: 'Manual Guest', apk_sha256: apkHash, signing_cert_sha256: guestCert, version_code: 1 },
        device: denyProof,
      },
    });
    assert.equal(jsonBody(await denied.text()).code, 'GUEST_PACKAGE_MISMATCH');

    const guestPost = await call(env, '/sdk/guests/new', {
      method: 'POST', cookie,
      body: form({ _csrf: token, package_name: guestPackage, app_name: 'Manual Guest', apk_sha256: apkHash, cert_sha256: guestCert, version_code: '1' }),
    });
    assert.equal(guestPost.status, 303);
    const guest = await env.DB.prepare('SELECT * FROM mak_guest_apps WHERE package_name=? ORDER BY id DESC LIMIT 1').bind(guestPackage).first();
    const bind = await call(env, `/sdk/keys/${manualLicense.id}/action`, {
      method: 'POST', cookie,
      body: form({ _csrf: token, action: 'binding_add', guest_id: guest.id, perm_launch: '1' }),
    });
    assert.equal(bind.status, 303);
    const binding = await env.DB.prepare('SELECT * FROM mak_bindings WHERE license_id=? AND guest_app_id=?').bind(manualLicense.id, guest.id).first();
    assert.equal(binding.host_id, 0);
    assert.equal(binding.can_launch, 1);
    assert.equal(binding.can_install, 0);

    const allowProof = await sessionProof(device, 'GUEST_CHECK', [session, 'LAUNCH', guestPackage, apkHash, guestCert, 1]);
    const allowed = await call(env, '/mak/v1/guest/check', {
      method: 'POST',
      json: {
        protocol: 'MAK/1', request_id: 'REQ_MANUAL_ALLOW', session_id: session, operation: 'LAUNCH',
        guest: { package_name: guestPackage, app_name: 'Manual Guest', apk_sha256: apkHash, signing_cert_sha256: guestCert, version_code: 1 },
        device: allowProof,
      },
    });
    const allowedJson = jsonBody(await allowed.text());
    assert.equal(allowedJson.decision, 'ALLOW', JSON.stringify(allowedJson));
    assert.equal(allowedJson.permissions.launch, true);

    const installProof = await sessionProof(device, 'GUEST_CHECK', [session, 'INSTALL', guestPackage, apkHash, guestCert, 1]);
    const installDenied = await call(env, '/mak/v1/guest/check', {
      method: 'POST',
      json: {
        protocol: 'MAK/1', request_id: 'REQ_MANUAL_INSTALL', session_id: session, operation: 'INSTALL',
        guest: { package_name: guestPackage, app_name: 'Manual Guest', apk_sha256: apkHash, signing_cert_sha256: guestCert, version_code: 1 },
        device: installProof,
      },
    });
    assert.equal(jsonBody(await installDenied.text()).code, 'OPERATION_NOT_ALLOWED');
  });

  await test('challenge replay, host mismatch, invalid device proof, server kill switch', async () => {
    const env = globalThis.__lastEnv;
    const { license, credential, device, cookie, token } = env.__test;
    const config = loadSigningConfig(env);

    // Replay a consumed challenge.
    const first = await authorize(env, { licenseCredential: credential, device });
    assert.equal(first.status, 200, JSON.stringify(first.response));
    const replayProof = await deviceProof(device, 'AUTHORIZE', [first.challenge.challenge_id, first.challenge.nonce, 'com.test.host', 'c'.repeat(64), device.publicKeyValue, nowS()]);
    const replay = await call(env, '/mak/v1/authorize', {
      method: 'POST',
      json: {
        protocol: 'MAK/1', request_id: 'REQ_REPLAY', challenge_id: first.challenge.challenge_id, nonce: first.challenge.nonce, timestamp: nowS(),
        license: { credential }, host: { package_name: 'com.test.host', signing_cert_sha256: 'c'.repeat(64) },
        device: { public_key: device.publicKeyValue, proof: replayProof, timestamp: nowS() },
      },
    });
    const replayJson = jsonBody(await replay.text());
    assert.equal(replayJson.decision, 'DENY');
    assert.equal(replayJson.code, 'NONCE_REPLAY');

    // Same MAK + device, different host certificate.
    const mismatch = await authorize(env, { licenseCredential: credential, device, hostCert: 'd'.repeat(64) });
    assert.equal(mismatch.status, 403);
    assert.equal(mismatch.response.decision, 'DENY');
    assert.equal(mismatch.response.code, 'HOST_CERT_MISMATCH');

    // Invalid signature consumes the challenge but must not register anything.
    const c = await challenge(env);
    const badSig = await call(env, '/mak/v1/authorize', {
      method: 'POST',
      json: {
        protocol: 'MAK/1', request_id: 'REQ_BAD_PROOF', challenge_id: c.challenge_id, nonce: c.nonce, timestamp: nowS(),
        license: { credential }, host: { package_name: 'com.test.host', signing_cert_sha256: 'c'.repeat(64) },
        device: { public_key: device.publicKeyValue, proof: b64encode(new Uint8Array(64)), timestamp: nowS() },
      },
    });
    const badJson = jsonBody(await badSig.text());
    assert.equal(badJson.decision, 'DENY');
    assert.equal(badJson.code, 'INVALID_DEVICE_PROOF');

    // Server OFF denies every decision, but /status stays available.
    const off = await call(env, '/sdk/settings/server', {
      method: 'POST', cookie,
      body: form({ _csrf: token, action: 'save', maintenance_message: 'Planned maintenance' }),
    });
    assert.equal(off.status, 303);
    const disabled = await challengeStatus(env);
    assert.equal(disabled.status, 503);
    const disabledJson = jsonBody(await disabled.text());
    assert.equal(disabledJson.decision, 'DENY');
    assert.equal(disabledJson.code, 'SERVER_DISABLED');
    assert.equal(verifySignedPayload(disabledJson, config, 'RESPONSE'), true);

    const status = await call(env, '/mak/v1/status');
    assert.equal(status.status, 200);
    const statusJson = jsonBody(await status.text());
    assert.equal(statusJson.server_enabled, false);
    assert.equal(statusJson.signature_alg, 'Ed25519');

    const on = await call(env, '/sdk/settings/server', {
      method: 'POST', cookie,
      body: form({ _csrf: token, action: 'save', server_enabled: '1', maintenance_message: 'OK', announcement: '' }),
    });
    assert.equal(on.status, 303);
    const worksAgain = await authorize(env, { licenseCredential: credential, device });
    assert.equal(worksAgain.status, 200, JSON.stringify(worksAgain.response));
    assert.equal(worksAgain.response.decision, 'ALLOW');
  });

  await test('license suspension and permanent revocation fail closed', async () => {
    const env = globalThis.__lastEnv;
    const { license, credential, device, cookie, token } = env.__test;

    const suspend = await call(env, `/sdk/keys/${license.id}/action`, {
      method: 'POST', cookie,
      body: form({ _csrf: token, action: 'suspend' }),
    });
    assert.equal(suspend.status, 303);
    const suspended = await authorize(env, { licenseCredential: credential, device });
    assert.equal(suspended.status, 403);
    assert.equal(suspended.response.decision, 'DENY');
    assert.equal(suspended.response.code, 'LICENSE_SUSPENDED');

    const reactivate = await call(env, `/sdk/keys/${license.id}/action`, {
      method: 'POST', cookie,
      body: form({ _csrf: token, action: 'reactivate' }),
    });
    assert.equal(reactivate.status, 303);
    const activeAgain = await authorize(env, { licenseCredential: credential, device });
    assert.equal(activeAgain.status, 200, JSON.stringify(activeAgain.response));
    assert.equal(activeAgain.response.decision, 'ALLOW');

    const revoke = await call(env, `/sdk/keys/${license.id}/action`, {
      method: 'POST', cookie,
      body: form({ _csrf: token, action: 'revoke' }),
    });
    assert.equal(revoke.status, 303);
    const revoked = await authorize(env, { licenseCredential: credential, device });
    assert.equal(revoked.status, 403);
    assert.equal(revoked.response.decision, 'DENY');
    assert.equal(revoked.response.code, 'LICENSE_REVOKED');
  });

  await test('panel logout + login + wrong password still work', async () => {
    const env = globalThis.__lastEnv;
    const { cookie } = env.__test;

    const logout = await call(env, '/logout', { cookie });
    assert.equal(logout.status, 302);
    assert.match(logout.headers.get('Location'), /^\/login/);

    const afterLogout = await call(env, '/dashboard', { cookie });
    assert.equal(afterLogout.status, 302);
    assert.match(afterLogout.headers.get('Location'), /^\/login/);

    const bad = await call(env, '/login', {
      method: 'POST', body: form({ username: 'owner', password: 'wrong-password' }),
    });
    assert.equal(bad.status, 200);
    assert.match(await bad.text(), /Invalid username or password/i);

    const login = await call(env, '/login', {
      method: 'POST', body: form({ username: 'owner', password: 'supersecret123' }),
    });
    assert.equal(login.status, 302);
    assert.match(login.headers.get('Location'), /^\/dashboard/);
    assert.match(setCookie(login), /sdk_session=/);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed\n`);
  if (failed.length) process.exitCode = 1;
}

async function run() {
  globalThis.__lastEnv = makeEnv();
  await main();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
