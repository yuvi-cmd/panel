// Local verification: crypto primitives, admin auth, UI mutations, and a full
// MAK/1 host + guest + revocation flow against an in-memory D1-compatible DB.
// Run with: npm test

import assert from 'node:assert/strict';
import { MemoryD1 } from './d1.mjs';
import {
  b64encode, canonicalJson, canonicalMak, deviceProofMessage, generateMak,
  loadSigningConfig, makHash, normalizeDevicePublicKey, nowS, signPayload,
  verifyDeviceProof, verifyPassword, verifySignedPayload, hashPassword,
} from '../src/backend/crypto.js';
import { handleRequest } from '../src/backend/router.js';

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
    PANEL_NAME: 'Test MAK',
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
  return handleRequest(request(env, path, opts), env);
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

async function authorize(env, { licenseCredential, device, hostPackage = 'com.test.host', hostCert = 'c'.repeat(64), timestamp = nowS() }) {
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
      host: { package_name: hostPackage, signing_cert_sha256: hostCert },
      device: { public_key: device.publicKeyValue, proof, timestamp },
    },
  });
  const text = await res.text();
  return { response: jsonBody(text), challenge: c, status: res.status };
}

async function deviceProof(device, kind, fields) {
  return device.sign(deviceProofMessage(kind, fields));
}

async function sessionProof(device, kind, fields) {
  const timestamp = nowS();
  const proof = await device.sign(deviceProofMessage(kind, [...fields, device.publicKeyValue, timestamp]));
  return { public_key: device.publicKeyValue, proof, timestamp };
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

  await test('panel setup, dashboard, license issuance and CSRF rejection', async () => {
    const env = globalThis.__lastEnv;
    const root = await call(env, '/');
    assert.equal(root.status, 303);
    assert.equal(root.headers.get('Location'), '/login');

    const setupPage = await call(env, '/setup');
    assert.equal(setupPage.status, 200);
    assert.match(await setupPage.text(), /First-run setup/);

    const setup = await call(env, '/setup', {
      method: 'POST',
      body: form({ username: 'owner', password: 'supersecret123', confirm_password: 'supersecret123' }),
    });
    assert.equal(setup.status, 303, await setup.clone().text());
    assert.equal(setup.headers.get('Location'), '/dashboard');
    const cookie = setCookie(setup);
    assert.match(cookie, /mak_admin=/);

    const dash = await call(env, '/dashboard', { cookie });
    assert.equal(dash.status, 200);
    const dashHtml = await dash.text();
    assert.match(dashHtml, /Activation overview/);
    assert.match(dashHtml, /Activation server is/);
    const token = csrf(dashHtml);

    const noCsrf = await call(env, '/settings/server', {
      method: 'POST', cookie, body: form({ action: 'save' }),
    });
    assert.equal(noCsrf.status, 403);

    const newPage = await call(env, '/licenses/new', { cookie });
    assert.equal(newPage.status, 200);
    const newHtml = await newPage.text();
    assert.equal(csrf(newHtml), token);

    const issued = await call(env, '/licenses/new', {
      method: 'POST',
      cookie,
      body: form({
        _csrf: token,
        label: 'Test License',
        user_ref: 'test-user',
        expires_on: futureDate(30),
        max_devices: '2',
        max_activations: '3',
        session_ttl: '3600',
        host_bind_mode: 'FIRST_USE',
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

    const detail = await call(env, '/licenses/' + license.id, { cookie });
    assert.equal(detail.status, 200);
    assert.match(await detail.text(), /Test License/);

    env.__test = { cookie, token, license, credential: makMatch[0], device: await makeDevice() };
  });

  await test('MAK/1 first-use host binding, guest checks, renew, heartbeat', async () => {
    const env = globalThis.__lastEnv;
    assert.ok(env, 'previous test environment');
    const { license, credential, device } = env.__test;
    const config = loadSigningConfig(env);

    const auth = await authorize(env, { licenseCredential: credential, device });
    assert.equal(auth.status, 200, JSON.stringify(auth.response));
    assert.equal(auth.response.decision, 'ALLOW');
    assert.equal(auth.response.code, 'AUTHORIZED');
    assert.equal(verifySignedPayload(auth.response, config, 'RESPONSE'), true, 'authorize response is signed');
    const session = auth.response.session.session_id;
    assert.ok(session);

    const hostRow = await env.DB.prepare('SELECT * FROM mak_hosts WHERE license_id=?').bind(license.id).first();
    assert.equal(hostRow.package_name, 'com.test.host');
    const deviceRow = await env.DB.prepare('SELECT * FROM mak_devices WHERE license_id=?').bind(license.id).first();
    assert.equal(deviceRow.status, 'ACTIVE');
    assert.match(deviceRow.fingerprint, /^SHA256:[0-9A-F]{64}$/);
    const licAfter = await env.DB.prepare('SELECT activation_count FROM mak_licenses WHERE id=?').bind(license.id).first();
    assert.equal(licAfter.activation_count, 1);

    // A guest is not approved yet.
    const guestPackage = 'com.test.guest';
    const apkHash = 'a'.repeat(64);
    const guestCert = 'b'.repeat(64);
    const guestProof = await sessionProof(device, 'GUEST_CHECK', [session, 'LAUNCH', guestPackage, apkHash, guestCert, 1]);
    const deniedGuest = await call(env, '/mak/v1/guest/check', {
      method: 'POST',
      json: {
        protocol: 'MAK/1', request_id: 'REQ_GUEST_DENY', session_id: session, operation: 'LAUNCH',
        guest: { package_name: guestPackage, app_name: 'Guest', apk_sha256: apkHash, signing_cert_sha256: guestCert, version_code: 1 },
        device: guestProof,
      },
    });
    const deniedJson = jsonBody(await deniedGuest.text());
    assert.equal(deniedJson.decision, 'DENY');
    assert.equal(deniedJson.code, 'GUEST_PACKAGE_MISMATCH');

    // Admin registers and binds the exact guest build.
    const { cookie, token } = env.__test;
    const guestPost = await call(env, '/guests/new', {
      method: 'POST', cookie,
      body: form({ _csrf: token, package_name: guestPackage, app_name: 'Guest', apk_sha256: apkHash, cert_sha256: guestCert, version_code: '1' }),
    });
    assert.equal(guestPost.status, 303, await guestPost.clone().text());
    const guest = await env.DB.prepare('SELECT * FROM mak_guest_apps ORDER BY id DESC LIMIT 1').first();
    assert.equal(guest.package_name, guestPackage);

    const bind = await call(env, `/licenses/${license.id}/action`, {
      method: 'POST', cookie,
      body: form({ _csrf: token, action: 'binding_add', guest_id: guest.id, perm_launch: '1' }),
    });
    assert.equal(bind.status, 303);
    const binding = await env.DB.prepare('SELECT * FROM mak_bindings WHERE license_id=? AND guest_app_id=?').bind(license.id, guest.id).first();
    assert.equal(binding.can_launch, 1);
    assert.equal(binding.can_install, 0);

    const allowedProof = await sessionProof(device, 'GUEST_CHECK', [session, 'LAUNCH', guestPackage, apkHash, guestCert, 1]);
    const allowed = await call(env, '/mak/v1/guest/check', {
      method: 'POST',
      json: {
        protocol: 'MAK/1', request_id: 'REQ_GUEST_ALLOW', session_id: session, operation: 'LAUNCH',
        guest: { package_name: guestPackage, app_name: 'Guest', apk_sha256: apkHash, signing_cert_sha256: guestCert, version_code: 1 },
        device: allowedProof,
      },
    });
    const allowedJson = jsonBody(await allowed.text());
    assert.equal(allowedJson.decision, 'ALLOW', JSON.stringify(allowedJson));
    assert.equal(allowedJson.permissions.launch, true);
    assert.equal(allowedJson.permissions.install, false);
    assert.equal(verifySignedPayload(allowedJson, config, 'RESPONSE'), true);

    const installProof = await sessionProof(device, 'GUEST_CHECK', [session, 'INSTALL', guestPackage, apkHash, guestCert, 1]);
    const installDenied = await call(env, '/mak/v1/guest/check', {
      method: 'POST',
      json: {
        protocol: 'MAK/1', request_id: 'REQ_GUEST_INSTALL', session_id: session, operation: 'INSTALL',
        guest: { package_name: guestPackage, app_name: 'Guest', apk_sha256: apkHash, signing_cert_sha256: guestCert, version_code: 1 },
        device: installProof,
      },
    });
    const installJson = jsonBody(await installDenied.text());
    assert.equal(installJson.decision, 'DENY');
    assert.equal(installJson.code, 'OPERATION_NOT_ALLOWED');

    const heartbeatProof = await sessionProof(device, 'HEARTBEAT', [session]);
    const heartbeat = await call(env, '/mak/v1/heartbeat', {
      method: 'POST',
      json: { protocol: 'MAK/1', request_id: 'REQ_HB', session_id: session, device: heartbeatProof },
    });
    const heartbeatJson = jsonBody(await heartbeat.text());
    assert.equal(heartbeatJson.decision, 'ALLOW');
    assert.equal(heartbeatJson.code, 'ALIVE');

    const renewProof = await sessionProof(device, 'RENEW', [session]);
    const renew = await call(env, '/mak/v1/renew', {
      method: 'POST',
      json: { protocol: 'MAK/1', request_id: 'REQ_RENEW', session_id: session, device: renewProof },
    });
    const renewJson = jsonBody(await renew.text());
    assert.equal(renewJson.decision, 'ALLOW');
    assert.equal(renewJson.code, 'RENEWED');

    env.__test.session = session;
    env.__test.guest = guest;
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
    const off = await call(env, '/settings/server', {
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

    const on = await call(env, '/settings/server', {
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

    const suspend = await call(env, `/licenses/${license.id}/action`, {
      method: 'POST', cookie,
      body: form({ _csrf: token, action: 'suspend' }),
    });
    assert.equal(suspend.status, 303);
    const suspended = await authorize(env, { licenseCredential: credential, device });
    assert.equal(suspended.status, 403);
    assert.equal(suspended.response.decision, 'DENY');
    assert.equal(suspended.response.code, 'LICENSE_SUSPENDED');

    const reactivate = await call(env, `/licenses/${license.id}/action`, {
      method: 'POST', cookie,
      body: form({ _csrf: token, action: 'reactivate' }),
    });
    assert.equal(reactivate.status, 303);
    const activeAgain = await authorize(env, { licenseCredential: credential, device });
    assert.equal(activeAgain.status, 200, JSON.stringify(activeAgain.response));
    assert.equal(activeAgain.response.decision, 'ALLOW');

    const revoke = await call(env, `/licenses/${license.id}/action`, {
      method: 'POST', cookie,
      body: form({ _csrf: token, action: 'revoke' }),
    });
    assert.equal(revoke.status, 303);
    const revoked = await authorize(env, { licenseCredential: credential, device });
    assert.equal(revoked.status, 403);
    assert.equal(revoked.response.decision, 'DENY');
    assert.equal(revoked.response.code, 'LICENSE_REVOKED');
  });

  await test('logout + login + wrong password', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;

    const logout = await call(env, '/logout', { method: 'POST', cookie, body: form({ _csrf: token }) });
    assert.equal(logout.status, 303);
    const cleared = setCookie(logout);
    assert.match(cleared, /mak_admin=($|;)/);

    const afterLogout = await call(env, '/dashboard', { cookie: cleared });
    assert.equal(afterLogout.status, 303);
    assert.match(afterLogout.headers.get('Location'), /^\/login/);

    const bad = await call(env, '/login', {
      method: 'POST', body: form({ username: 'owner', password: 'wrong-password' }),
    });
    assert.equal(bad.status, 401);

    const login = await call(env, '/login', {
      method: 'POST', body: form({ username: 'owner', password: 'supersecret123' }),
    });
    assert.equal(login.status, 303);
    assert.match(login.headers.get('Location'), /^\/dashboard|^\//);
    assert.match(setCookie(login), /mak_admin=/);
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
