// MAK/2 verification — encrypted envelope, app-locked grants, host/launch
// tickets, AUTO/MANUAL binding, seats, expiry and MAK/1 removal.
// Run with: npm test

import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import { MemoryD1 } from './d1.mjs';
import {
  b64decode, b64encode, canonicalJson, canonicalMak, generateMak,
  hkdfSha256, loadEncryptionConfig, loadSigningConfig, makHash, nowS,
  signWithProtocol, verifyWithProtocol, verifyPassword, hashPassword,
  fromUtf8, utf8,
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
  const encSeed = new Uint8Array(32);
  for (let i = 0; i < encSeed.length; i++) encSeed[i] = (i * 13 + 29) & 255;
  return {
    DB: new MemoryD1(),
    PANEL_CODE: 'YUVI_001',
    PANEL_NAME: 'Test Panel',
    MAK_SERVER_NAME: 'Test Activation',
    MAK_SIGNING_KEY: b64(seed),
    MAK_SIGNING_KEY_ID: 'TEST-ED25519-01',
    MAK_ENC_KEY: b64(encSeed),
    MAK_ENC_KEY_ID: 'TEST-ENC-01',
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
  return values.map((v) => v.split(';')[0]).filter(Boolean).join('; ');
}

function csrf(htmlText) {
  const m = /name="_csrf" value="([^"]+)"/.exec(htmlText);
  assert.ok(m, 'expected a CSRF token in the page');
  return m[1];
}

function jsonBody(text) {
  return JSON.parse(text);
}

function randomNonce() {
  return b64(crypto.getRandomValues(new Uint8Array(24)));
}

// Encrypt a MAK/2 request and verify + decrypt the response. The server
// public key comes from the same config the Worker uses, which mirrors the
// key pinned inside the AAR.
async function envelopeCall(env, endpoint, payload) {
  const enc = loadEncryptionConfig(env);
  assert.equal(enc.ok, true, 'server encryption key');
  const serverPub = b64decode(enc.public_key);
  const client = nacl.box.keyPair();
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  const shared = nacl.box.before(serverPub, client.secretKey);
  const reqKey = await hkdfSha256(shared, nonce, 'MAK/2-REQ');
  const inner = { protocol: 'MAK/2', endpoint, ...payload };
  const plaintext = canonicalJson(inner);
  const cipher = nacl.secretbox(utf8(plaintext), nonce, reqKey);
  const res = await call(env, '/mak/v2/' + endpoint, {
    method: 'POST',
    json: {
      v: 2,
      e: b64encode(client.publicKey),
      n: b64encode(nonce),
      c: b64encode(cipher),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = jsonBody(text);
  } catch {
    assert.fail('non-JSON response: ' + text.slice(0, 200));
  }
  assert.equal(body.v, 2, 'response is an envelope: ' + text.slice(0, 400));
  const respKey = await hkdfSha256(shared, nonce, 'MAK/2-RESP');
  const opened = nacl.secretbox.open(b64decode(body.c), nonce, respKey);
  assert.ok(opened, 'response decrypts');
  const responseText = fromUtf8(opened);
  const config = loadSigningConfig(env);
  const sigOk = nacl.sign.detached.verify(
    utf8('MAK/2\nENVELOPE\n' + responseText),
    b64decode(body.sig),
    b64decode(config.active.public_key),
  );
  assert.equal(sigOk, true, 'envelope Ed25519 signature');
  return { status: res.status, body: JSON.parse(responseText), text: responseText, config };
}

async function activate(env, credential, { hostPackage = 'com.test.host', hostCert = 'c'.repeat(64), appName = 'Test Host' } = {}) {
  return envelopeCall(env, 'activate', {
    mak: credential, package_name: hostPackage, app_name: appName, cert_sha256: hostCert,
  });
}

async function hostVerify(env, credential, grantId, { hostPackage = 'com.test.host', hostCert = 'c'.repeat(64) } = {}) {
  return envelopeCall(env, 'host/verify', {
    grant_id: grantId, mak: credential, package_name: hostPackage,
    app_name: 'Test Host', cert_sha256: hostCert, nonce: randomNonce(),
  });
}

async function guestCheck(env, credential, grantId, {
  operation = 'LAUNCH', hostPackage = 'com.test.host', hostCert = 'c'.repeat(64),
  guestPackage = 'com.test.guest', guestCert = 'b'.repeat(64), apkHash = 'a'.repeat(64), versionCode = 1,
} = {}) {
  return envelopeCall(env, 'guest/check', {
    grant_id: grantId,
    mak: credential,
    package_name: hostPackage,
    cert_sha256: hostCert,
    operation,
    nonce: randomNonce(),
    guest: {
      package_name: guestPackage,
      app_name: 'Guest',
      apk_sha256: apkHash,
      cert_sha256: guestCert,
      version_code: versionCode,
    },
  });
}

async function issueLicense(env, cookie, token, data = {}) {
  const body = form({
    _csrf: token,
    label: 'Test License',
    user_ref: 'test-user',
    duration: '30',
    max_devices: '1',
    max_activations: '1',
    session_ttl: '3600',
    max_packages: '2',
    max_apps: '2',
    max_installs: '3',
    signature_bind: '1',
    host_bind_mode: 'AUTO',
    notes: 'unit test',
    ...data,
  });
  const res = await call(env, '/sdk/generate', { method: 'POST', cookie, body });
  const html = await res.text();
  return { res, html, mak: (/MAK-[0-9A-HJKMNP-TV-Z]{5}(?:-[0-9A-HJKMNP-TV-Z]{5}){3}/.exec(html) || [])[0] };
}

async function main() {
  console.log('\nMAK/2 panel verification\n');

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

  await test('MAK/2 Ed25519 grant signing + tamper rejection', () => {
    const config = loadSigningConfig({ MAK_SIGNING_KEY: makeEnv().MAK_SIGNING_KEY, MAK_SIGNING_KEY_ID: 'TEST-K1' });
    assert.equal(config.ok, true);
    const signed = signWithProtocol({ v: 2, grant_id: 'GRT-TEST', epoch: 1 }, config, 'MAK/2', 'GRANT');
    assert.equal(verifyWithProtocol(signed, config, 'MAK/2', 'GRANT'), true);
    assert.equal(verifyWithProtocol({ ...signed, epoch: 2 }, config, 'MAK/2', 'GRANT'), false);
    assert.equal(verifyWithProtocol(signed, config, 'MAK/2', 'RESPONSE'), false);
  });

  await test('password hashing verifies and rejects wrong passwords', async () => {
    const stored = await hashPassword('correct horse battery staple');
    assert.equal(await verifyPassword('correct horse battery staple', stored), true);
    assert.equal(await verifyPassword('wrong password', stored), false);
  });

  await test('panel setup + clean generate form + MAK/2 license fields', async () => {
    const env = makeEnv();
    globalThis.__lastEnv = env;

    const setup = await call(env, '/setup', {
      method: 'POST', body: form({ username: 'owner', password: 'supersecret123' }),
    });
    assert.equal(setup.status, 302, await setup.clone().text());
    const cookie = setCookie(setup);
    assert.match(cookie, /sdk_session=/);

    const dash = await call(env, '/sdk/settings', { cookie });
    const dashHtml = await dash.text();
    assert.equal(dash.status, 200);
    const token = csrf(dashHtml);

    const newPage = await call(env, '/sdk/generate', { cookie });
    const newHtml = await newPage.text();
    assert.equal(newPage.status, 200);
    assert.match(newHtml, /Custom MAK key/);
    assert.match(newHtml, /Signature Bind/);
    assert.match(newHtml, /Max installs \/ package/);
    assert.match(newHtml, /name="guest_cert"/);

    const issued = await issueLicense(env, cookie, token);
    assert.equal(issued.res.status, 200, issued.html.slice(0, 500));
    assert.ok(issued.mak, 'raw MAK appears on the reveal page');
    const license = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();
    assert.equal(license.max_packages, 2);
    assert.equal(license.max_apps, 2);
    assert.equal(license.max_installs, 3);
    assert.equal(license.signature_bind, 1);
    assert.equal(license.epoch, 1);
    assert.equal(license.activation_count, 0);

    env.__test = { cookie, token, license, credential: issued.mak };
  });

  await test('encrypted activation issues a signed grant with expiry', async () => {
    const env = globalThis.__lastEnv;
    const { credential } = env.__test;
    const res = await activate(env, credential);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.decision, 'ALLOW');
    assert.equal(res.body.code, 'ACTIVATED');
    assert.equal(verifyWithProtocol(res.body, res.config, 'MAK/2', 'RESPONSE'), true);
    assert.equal(verifyWithProtocol(res.body.grant, res.config, 'MAK/2', 'GRANT'), true);
    assert.match(res.body.grant.grant_id, /^GRT-[0-9A-F]{24}$/);
    assert.equal(res.body.grant.package_name, 'com.test.host');
    assert.equal(res.body.grant.cert_sha256, 'c'.repeat(64));
    assert.equal(res.body.grant.signature_bind, true);
    assert.equal(res.body.grant.max_apps, 2);
    assert.equal(res.body.grant.max_installs, 3);
    assert.ok(res.body.grant.expires_at > nowS() + 29 * 86400);
    env.__test.grant = res.body.grant;
  });

  await test('host verification issues a signed HostTicket', async () => {
    const env = globalThis.__lastEnv;
    const { credential, grant } = env.__test;
    const res = await hostVerify(env, credential, grant.grant_id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.code, 'HOST_VERIFIED');
    assert.equal(verifyWithProtocol(res.body.ticket, res.config, 'MAK/2', 'HOST-TICKET'), true);
    assert.equal(res.body.ticket.grant_id, grant.grant_id);
    assert.equal(res.body.ticket.package_name, 'com.test.host');
    assert.ok(res.body.ticket.nonce);
    env.__test.hostTicket = res.body.ticket;
  });

  await test('guest AUTO binding, LaunchTicket, app limit and version reuse', async () => {
    const env = globalThis.__lastEnv;
    const { credential, grant } = env.__test;

    const first = await guestCheck(env, credential, grant.grant_id);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.code, 'AUTHORIZED');
    assert.equal(verifyWithProtocol(first.body.ticket, first.config, 'MAK/2', 'LAUNCH-TICKET'), true);
    assert.equal(first.body.ticket.guest.package_name, 'com.test.guest');
    assert.equal(first.body.permissions.launch, true);

    const v2 = await guestCheck(env, credential, grant.grant_id, { apkHash: 'f'.repeat(64), versionCode: 2 });
    assert.equal(v2.body.decision, 'ALLOW');

    const distinct = await env.DB.prepare(
      `SELECT COUNT(DISTINCT g.package_name) AS c FROM mak_bindings b
         JOIN mak_guest_apps g ON g.id=b.guest_app_id
        WHERE b.license_id=? AND b.status='ACTIVE'`,
    ).bind(env.__test.license.id).first();
    assert.equal(distinct.c, 1, 'same package new version does not consume a slot');

    const second = await guestCheck(env, credential, grant.grant_id, {
      guestPackage: 'com.test.guest2', guestCert: '1'.repeat(64), apkHash: '1'.repeat(64),
    });
    assert.equal(second.body.decision, 'ALLOW');

    const third = await guestCheck(env, credential, grant.grant_id, {
      guestPackage: 'com.test.guest3', guestCert: '2'.repeat(64), apkHash: '2'.repeat(64),
    });
    assert.equal(third.body.decision, 'DENY');
    assert.equal(third.body.code, 'APP_LIMIT_REACHED');
  });

  await test('second host package allowed, third blocked by max_packages', async () => {
    const env = globalThis.__lastEnv;
    const { credential } = env.__test;
    const second = await activate(env, credential, {
      hostPackage: 'com.test.host2', hostCert: 'e'.repeat(64), appName: 'Second Host',
    });
    assert.equal(second.body.decision, 'ALLOW', JSON.stringify(second.body));

    const third = await activate(env, credential, {
      hostPackage: 'com.test.host3', hostCert: '3'.repeat(64), appName: 'Third Host',
    });
    assert.equal(third.body.decision, 'DENY');
    assert.equal(third.body.code, 'PACKAGE_LIMIT_REACHED');
  });

  await test('host certificate mismatch is rejected', async () => {
    const env = globalThis.__lastEnv;
    const { credential } = env.__test;
    const res = await activate(env, credential, { hostCert: '9'.repeat(64) });
    assert.equal(res.body.decision, 'DENY');
    assert.equal(res.body.code, 'HOST_CERT_MISMATCH');
  });

  await test('grant revocation + status + replay nonce', async () => {
    const env = globalThis.__lastEnv;
    const { credential, grant } = env.__test;

    const status = await envelopeCall(env, 'status', { mak: credential, grant_id: grant.grant_id });
    assert.equal(status.body.decision, 'ALLOW');
    assert.equal(status.body.status, 'ACTIVE');

    const deactivate = await envelopeCall(env, 'deactivate', { mak: credential, grant_id: grant.grant_id });
    assert.equal(deactivate.body.code, 'DEACTIVATED');

    const after = await hostVerify(env, credential, grant.grant_id);
    assert.equal(after.body.decision, 'DENY');
    assert.equal(after.body.code, 'GRANT_REVOKED');

    // Same request nonce twice: the second call must fail closed.
    const enc = loadEncryptionConfig(env);
    const client = nacl.box.keyPair();
    const nonce = crypto.getRandomValues(new Uint8Array(24));
    const shared = nacl.box.before(b64decode(enc.public_key), client.secretKey);
    const key = await hkdfSha256(shared, nonce, 'MAK/2-REQ');
    const inner = canonicalJson({ protocol: 'MAK/2', endpoint: 'activate', mak: credential, package_name: 'com.test.host', app_name: 'Test Host', cert_sha256: 'c'.repeat(64) });
    const cipher = b64encode(nacl.secretbox(utf8(inner), nonce, key));
    const body = { v: 2, e: b64encode(client.publicKey), n: b64encode(nonce), c: cipher };
    const one = await call(env, '/mak/v2/activate', { method: 'POST', json: body });
    assert.equal(one.status, 200);
    const two = await call(env, '/mak/v2/activate', { method: 'POST', json: body });
    assert.equal(two.status, 409);
  });

  await test('MANUAL binding requires pre-registered host and guest', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;
    const issued = await issueLicense(env, cookie, token, {
      label: 'Manual License',
      max_packages: '1',
      max_apps: '2',
      max_installs: '2',
      signature_bind: '1',
      host_bind_mode: 'MANUAL',
      host_package: 'com.manual.host',
      host_app_name: 'Manual Host',
      host_cert: 'd'.repeat(64),
      guest_package: 'com.manual.guest',
      guest_app_name: 'Manual Guest',
      guest_cert: 'e'.repeat(64),
    });
    assert.equal(issued.res.status, 200, issued.html.slice(0, 500));
    const license = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();
    assert.equal(license.host_bind_mode, 'MANUAL');

    const wrong = await activate(env, issued.mak, { hostPackage: 'com.manual.other', hostCert: 'd'.repeat(64) });
    assert.equal(wrong.body.code, 'HOST_PACKAGE_MISMATCH');

    const ok = await activate(env, issued.mak, { hostPackage: 'com.manual.host', hostCert: 'd'.repeat(64), appName: 'Manual Host' });
    assert.equal(ok.body.decision, 'ALLOW', JSON.stringify(ok.body));

    const deniedGuest = await guestCheck(env, issued.mak, ok.body.grant.grant_id, {
      hostPackage: 'com.manual.host', hostCert: 'd'.repeat(64),
      guestPackage: 'com.manual.other', guestCert: 'e'.repeat(64),
    });
    assert.equal(deniedGuest.body.code, 'GUEST_PACKAGE_MISMATCH');

    const allowedGuest = await guestCheck(env, issued.mak, ok.body.grant.grant_id, {
      hostPackage: 'com.manual.host', hostCert: 'd'.repeat(64),
      guestPackage: 'com.manual.guest', guestCert: 'e'.repeat(64),
    });
    assert.equal(allowedGuest.body.decision, 'ALLOW', JSON.stringify(allowedGuest.body));
  });

  await test('Signature Bind OFF ignores certificates', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;
    const issued = await issueLicense(env, cookie, token, {
      label: 'No Signature Bind', signature_bind: '0', host_bind_mode: 'AUTO',
      max_packages: '1', max_apps: '1', max_installs: '1',
    });
    assert.equal(issued.res.status, 200, issued.html.slice(0, 500));
    const res = await activate(env, issued.mak, {
      hostPackage: 'com.nosig.host', hostCert: 'a'.repeat(64), appName: 'No Sig',
    });
    assert.equal(res.body.decision, 'ALLOW', JSON.stringify(res.body));
    assert.equal(res.body.grant.signature_bind, false);
  });

  await test('custom MAK key is used verbatim and duplicates are rejected', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;
    const custom = 'MAK-AAAAA-BBBBB-CCCCC-DDDDD';
    const first = await issueLicense(env, cookie, token, {
      label: 'Custom Key', custom_key: custom, signature_bind: '0', max_installs: '1',
    });
    assert.equal(first.res.status, 200, first.html.slice(0, 500));
    assert.equal(first.mak, custom);

    const second = await issueLicense(env, cookie, token, {
      label: 'Custom Key Duplicate', custom_key: custom, signature_bind: '0',
    });
    assert.equal(second.res.status, 400);
    assert.match(second.html, /already in use/i);
  });

  await test('server-side expiry rejects an expired license', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;
    const issued = await issueLicense(env, cookie, token, {
      label: 'Expired License', signature_bind: '0', max_installs: '1',
    });
    const license = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();
    await env.DB.prepare('UPDATE mak_licenses SET expires_at=? WHERE id=?').bind(nowS() - 10, license.id).run();
    const res = await activate(env, issued.mak, { hostPackage: 'com.expired.host' });
    assert.equal(res.body.decision, 'DENY');
    assert.equal(res.body.code, 'LICENSE_EXPIRED');
  });

  await test('MAK/1 endpoints are removed', async () => {
    const env = globalThis.__lastEnv;
    const res = await call(env, '/mak/v1/challenge', { method: 'POST', json: { protocol: 'MAK/1' } });
    assert.equal(res.status, 410);
    const body = jsonBody(await res.text());
    assert.equal(body.code, 'PROTOCOL_REMOVED');
  });

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed\n');
  if (failed.length) process.exitCode = 1;
}

await main();
