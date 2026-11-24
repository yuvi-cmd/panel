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
import { loadKeyConfig } from '../src/mak/keystore.js';
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

// Same wire helper, but resolves the encryption/signing keys exactly like a
// real client: from /mak/v2/status (panel keyring), not from env secrets.
async function panelEnvelopeCall(env, endpoint, payload) {
  const keys = await loadKeyConfig(env.DB, env, { force: true });
  assert.equal(keys.encryption.ok, true, 'panel encryption key');
  assert.equal(keys.signing.ok, true, 'panel signing key');
  const serverPub = b64decode(keys.encryption.public_key);
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
  const body = jsonBody(text);
  assert.equal(body.v, 2, 'response is an envelope');
  assert.equal(body.key_id, undefined, 'response envelope leaks no key id');
  const respKey = await hkdfSha256(shared, nonce, 'MAK/2-RESP');
  const opened = nacl.secretbox.open(b64decode(body.c), nonce, respKey);
  assert.ok(opened, 'response decrypts');
  const responseText = fromUtf8(opened);
  assert.equal(nacl.sign.detached.verify(
    utf8('MAK/2\nENVELOPE\n' + responseText),
    b64decode(body.sig),
    b64decode(keys.signing.active.public_key),
  ), true, 'envelope Ed25519 signature');
  return { status: res.status, body: JSON.parse(responseText), keys };
}

async function readStatus(env) {
  const res = await call(env, '/mak/v2/status');
  const status = await res.json();
  assert.equal(status.protocol, 'MAK/2');
  if (status.signing_ready) {
    const body = { ...status };
    delete body.signature;
    const activeKey = (status.public_keys || []).find((key) => key.active);
    assert.ok(activeKey, 'status publishes an active signing key');
    assert.equal(nacl.sign.detached.verify(
      utf8('MAK/2\nSTATUS\n' + canonicalJson(body)),
      b64decode(status.signature),
      b64decode(activeKey.public_key),
    ), true, 'status signature verifies with the published key');
  }
  return status;
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
    assert.match(newHtml, /name="max_installs"/);
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

  await test('any-length custom MAK works and is revealed blurred on MAK Keys', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;
    const custom = 'rahul-ki-key';
    const issued = await issueLicense(env, cookie, token, {
      label: 'Short custom', custom_key: custom, signature_bind: '0', max_installs: '1',
    });
    assert.equal(issued.res.status, 200, issued.html.slice(0, 300));
    assert.ok(issued.html.includes(custom), 'custom key is shown verbatim');

    const row = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();
    assert.equal(row.credential_plain, custom);
    assert.notEqual(row.credential_hash, custom);

    const activated = await activate(env, custom, { hostPackage: 'com.custom.host' });
    assert.equal(activated.body.decision, 'ALLOW', JSON.stringify(activated.body));

    const page = await call(env, '/sdk/keys', { cookie });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.ok(html.includes(custom), 'raw MAK is available on the keys page');
    assert.match(html, /toggleMakKey/);
    assert.match(html, /copyMakKey/);
    assert.match(html, /blur\(5px\)/);
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

  await test('MAK keys quick actions: extend duration, raise limits, block package', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;
    const issued = await issueLicense(env, cookie, token, {
      label: 'Quick actions', signature_bind: '0',
      max_packages: '1', max_apps: '2', max_installs: '3',
    });
    assert.ok(issued.mak);
    const license = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();

    const action = (fields) => call(env, '/sdk/keys/' + license.id + '/action', {
      method: 'POST', cookie, body: form({ _csrf: token, ...fields }),
    });

    // Numeric durations start on the first successful app bind, so an
    // extension before that point increases the reserved duration instead of
    // writing an expiry timestamp.
    const beforeDays = Number(license.duration_days);
    assert.ok(beforeDays > 0, 'issued license carries a reserved duration');
    assert.equal((await action({ action: 'extend_duration', extend_days: '7' })).status, 303);
    const extended = await env.DB.prepare('SELECT * FROM mak_licenses WHERE id=?').bind(license.id).first();
    assert.equal(Number(extended.duration_days), beforeDays + 7, 'reserved duration extended by 7 days');
    assert.equal(extended.expires_at, null, 'expiry is not written before the first app bind');

    assert.equal((await action({ action: 'extend_limits', max_packages: '3', max_apps: '4', max_installs: '5' })).status, 303);
    const raised = await env.DB.prepare('SELECT * FROM mak_licenses WHERE id=?').bind(license.id).first();
    assert.equal(Number(raised.max_packages), 3);
    assert.equal(Number(raised.max_apps), 4);
    assert.equal(Number(raised.max_installs), 5);

    // The Install Seats control is hidden from the UI. A limits update that
    // omits the field must keep the existing backend seat policy untouched.
    assert.equal((await action({ action: 'extend_limits', max_packages: '3', max_apps: '4' })).status, 303);
    const kept = await env.DB.prepare('SELECT * FROM mak_licenses WHERE id=?').bind(license.id).first();
    assert.equal(Number(kept.max_installs), 5);

    assert.equal((await action({ action: 'host_save', host_package: 'com.quick.host', host_app_name: 'Quick', host_cert: '' })).status, 303);
    const host = await env.DB.prepare('SELECT * FROM mak_hosts WHERE license_id=? ORDER BY id DESC LIMIT 1').bind(license.id).first();
    assert.equal(host.package_name, 'com.quick.host');
    assert.equal(host.status, 'ACTIVE');

    assert.equal((await action({ action: 'host_block', host_id: String(host.id) })).status, 303);
    const blocked = await env.DB.prepare('SELECT * FROM mak_hosts WHERE id=?').bind(host.id).first();
    assert.equal(blocked.status, 'SUSPENDED');

    assert.equal((await action({ action: 'host_unblock', host_id: String(host.id) })).status, 303);
    const unblocked = await env.DB.prepare('SELECT * FROM mak_hosts WHERE id=?').bind(host.id).first();
    assert.equal(unblocked.status, 'ACTIVE');

    const page = await call(env, '/sdk/keys', { cookie });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /MAK details &amp; quick actions/);
    assert.match(html, /Extend limits/);
    assert.match(html, /host_block|host_unblock/);
    assert.match(html, /Delete MAK/);
    assert.doesNotMatch(html, /INSTALL SEATS/);
    assert.doesNotMatch(html, /Install seats \/ package/);

    const detail = await call(env, '/sdk/keys/' + license.id, { cookie });
    const detailHtml = await detail.text();
    assert.equal(detail.status, 200);
    assert.doesNotMatch(detailHtml, /Max installs per package/);
    assert.match(detailHtml, /Delete MAK/);
  });

  await test('Delete MAK removes the license and all runtime rows', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;
    const issued = await issueLicense(env, cookie, token, {
      label: 'Delete me', signature_bind: '0', max_installs: '5',
    });
    assert.ok(issued.mak, issued.html.slice(0, 500));
    const license = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();

    const activated = await activate(env, issued.mak, { hostPackage: 'com.delete.host', hostCert: '' });
    assert.equal(activated.body.decision, 'ALLOW', JSON.stringify(activated.body));
    const now = nowS();
    await env.DB.prepare('INSERT INTO mak_bindings (license_id,host_id,guest_app_id,created_at,updated_at) VALUES (?,?,?,?,?)')
      .bind(license.id, 0, 9999, now, now).run();
    await env.DB.prepare('INSERT INTO mak_devices (device_uid,license_id,public_key,fingerprint,registered_at) VALUES (?,?,?,?,?)')
      .bind('DEV-DELETE-TEST', license.id, 'spki:test', 'fp-delete', now).run();
    await env.DB.prepare('INSERT INTO mak_sessions (id,license_id,device_id,issued_at,expires_at) VALUES (?,?,?,?,?)')
      .bind('SESS-DELETE-TEST', license.id, 1, now, now + 3600).run();

    const res = await call(env, '/sdk/keys/' + license.id + '/action', {
      method: 'POST', cookie, body: form({ _csrf: token, action: 'delete' }),
    });
    assert.equal(res.status, 303);
    assert.match(String(res.headers.get('Location') || ''), /^\/sdk\/keys\?ok=/);

    for (const table of ['mak_hosts', 'mak_bindings', 'mak_grants', 'mak_devices', 'mak_sessions']) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE license_id=?`).bind(license.id).first();
      assert.equal(Number(row.c), 0, table + ' rows must be removed');
    }
    const gone = await env.DB.prepare('SELECT id FROM mak_licenses WHERE id=?').bind(license.id).first();
    assert.equal(gone, null);

    const event = await env.DB.prepare("SELECT * FROM mak_events WHERE event_type='LICENSE_DELETED' ORDER BY id DESC LIMIT 1").first();
    assert.ok(event, 'deletion is written to the security log');
    assert.equal(Number(event.license_id || 0), 0);
    assert.match(event.detail, new RegExp(license.license_uid));

    const page = await call(env, '/sdk/keys', { cookie });
    const html = await page.text();
    assert.ok(!html.includes(license.license_uid), 'deleted MAK is no longer listed');
  });

  await test('Guest Apps, Hosts, Devices, Sessions and Logs share one green SDK shell', async () => {
    const env = globalThis.__lastEnv;
    const { cookie } = env.__test;
    for (const path of ['/sdk/guests', '/sdk/hosts', '/sdk/devices', '/sdk/sessions', '/sdk/logs']) {
      const res = await call(env, path, { cookie });
      const html = await res.text();
      assert.equal(res.status, 200, path);
      assert.match(html, /glass-sidebar/, path + ' uses the glass SDK shell');
      assert.match(html, /class="mak-admin"/, path + ' wraps MAK content for the shared shell');
      assert.match(html, /data-theme="emerald"/, path + ' uses the single green theme');
      assert.match(html, /<\/style><style>\s*\.mak-admin\{/, path + ' injects MAK CSS inside a style tag');
      assert.doesNotMatch(html, /<\/style>\s*\.mak-admin\{/, path + ' never leaks raw CSS into the body');
      assert.doesNotMatch(html, /SDK PANEL · MAK\/2/, path + ' has no duplicate MAK theme');
    }
  });

  await test('numeric duration starts on first app bind and never resets', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;
    const issued = await issueLicense(env, cookie, token, {
      label: 'Duration lifecycle', signature_bind: '0', max_packages: '2', duration: '30',
    });
    assert.ok(issued.mak);
    const license = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();
    assert.equal(license.started_at, null);
    assert.equal(license.expires_at, null);
    assert.equal(Number(license.duration_days), 30);

    const before = await call(env, '/sdk/keys?q=' + encodeURIComponent(license.license_uid), { cookie });
    assert.match(await before.text(), /NOT YET STARTED/, 'MAK Keys shows the pending lifecycle');

    const first = await activate(env, issued.mak, { hostPackage: 'com.duration.one', hostCert: '' });
    assert.equal(first.body.decision, 'ALLOW', JSON.stringify(first.body));
    const started = await env.DB.prepare('SELECT * FROM mak_licenses WHERE id=?').bind(license.id).first();
    assert.ok(Number(started.started_at) > 0, 'first app bind records started_at');
    assert.equal(Number(started.expires_at), Number(started.started_at) + 30 * 86400);

    const second = await activate(env, issued.mak, { hostPackage: 'com.duration.two', hostCert: '' });
    assert.equal(second.body.decision, 'ALLOW', JSON.stringify(second.body));
    const after = await env.DB.prepare('SELECT * FROM mak_licenses WHERE id=?').bind(license.id).first();
    assert.equal(Number(after.started_at), Number(started.started_at), 'later binds keep the original start');
    assert.equal(Number(after.expires_at), Number(started.expires_at), 'later binds never push expiry forward');
  });

  await test('suspended packages keep their slot; delete frees it and cascades state', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;
    const issued = await issueLicense(env, cookie, token, {
      label: 'Slot accounting', signature_bind: '0', max_packages: '1',
    });
    assert.ok(issued.mak);
    const license = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();

    const first = await activate(env, issued.mak, { hostPackage: 'com.slot.one', hostCert: '' });
    assert.equal(first.body.decision, 'ALLOW', JSON.stringify(first.body));
    const host = await env.DB.prepare('SELECT * FROM mak_hosts WHERE license_id=?').bind(license.id).first();

    const action = (fields) => call(env, '/sdk/keys/' + license.id + '/action', {
      method: 'POST', cookie, body: form({ _csrf: token, ...fields }),
    });

    // Suspend keeps the package row, so the single slot must stay consumed.
    assert.equal((await action({ action: 'host_block', host_id: String(host.id) })).status, 303);
    const blocked = await env.DB.prepare('SELECT * FROM mak_hosts WHERE id=?').bind(host.id).first();
    assert.equal(blocked.status, 'SUSPENDED');
    const denied = await activate(env, issued.mak, { hostPackage: 'com.slot.two', hostCert: '' });
    assert.equal(denied.body.decision, 'DENY', JSON.stringify(denied.body));
    assert.equal(denied.body.code, 'PACKAGE_LIMIT_REACHED');
    const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM mak_hosts WHERE license_id=?').bind(license.id).first();
    assert.equal(Number(count.c), 1, 'suspended row still occupies the package slot');

    // Explicit delete removes host-scoped runtime state and frees the slot.
    assert.equal((await action({ action: 'host_delete', host_id: String(host.id) })).status, 303);
    const hosts = await env.DB.prepare('SELECT COUNT(*) AS c FROM mak_hosts WHERE license_id=?').bind(license.id).first();
    const grants = await env.DB.prepare('SELECT COUNT(*) AS c FROM mak_grants WHERE license_id=?').bind(license.id).first();
    assert.equal(Number(hosts.c), 0);
    assert.equal(Number(grants.c), 0, 'host grants are cascade-deleted');
    const rebound = await activate(env, issued.mak, { hostPackage: 'com.slot.two', hostCert: '' });
    assert.equal(rebound.body.decision, 'ALLOW', JSON.stringify(rebound.body));
  });

  await test('host suspend/delete actions return to the same filtered page', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;
    const issued = await issueLicense(env, cookie, token, {
      label: 'Same page redirect', signature_bind: '0', max_packages: '1',
    });
    assert.ok(issued.mak);
    const license = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();
    const activated = await activate(env, issued.mak, { hostPackage: 'com.redirect.host', hostCert: '' });
    assert.equal(activated.body.decision, 'ALLOW');
    const host = await env.DB.prepare('SELECT * FROM mak_hosts WHERE license_id=?').bind(license.id).first();

    const res = await call(env, '/sdk/hosts/action', {
      method: 'POST', cookie,
      body: form({
        _csrf: token, license_id: license.id, host_id: host.id,
        action: 'suspend', return: '/hosts?status=SUSPENDED&q=com.redirect',
      }),
    });
    assert.equal(res.status, 303);
    const location = String(res.headers.get('Location') || '');
    assert.ok(location.startsWith('/sdk/hosts?status=SUSPENDED&q=com.redirect'), location);

    const deleted = await call(env, '/sdk/hosts/action', {
      method: 'POST', cookie,
      body: form({
        _csrf: token, license_id: license.id, host_id: host.id,
        action: 'delete', return: '/hosts?status=SUSPENDED&q=com.redirect',
      }),
    });
    assert.equal(deleted.status, 303);
    assert.ok(String(deleted.headers.get('Location') || '').startsWith('/sdk/hosts?status=SUSPENDED&q=com.redirect'));
  });

  await test('deleting a guest app removes every binding and frees app slots', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;
    const now = nowS();
    const guest = await env.DB.prepare(
      'INSERT INTO mak_guest_apps (package_name,app_name,apk_sha256,cert_sha256,version_code,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
    ).bind('com.delete.guest', 'Delete Guest', '1'.repeat(64), '2'.repeat(64), 1, 'ACTIVE', now, now).first();
    assert.ok(guest?.id);

    const issued = await issueLicense(env, cookie, token, {
      label: 'App slot delete', signature_bind: '0', max_apps: '1',
    });
    assert.ok(issued.mak);
    const license = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();
    const licenseAction = (fields) => call(env, '/sdk/keys/' + license.id + '/action', {
      method: 'POST', cookie, body: form({ _csrf: token, ...fields }),
    });

    assert.equal((await licenseAction({ action: 'binding_add', guest_id: String(guest.id) })).status, 303);
    let bound = await env.DB.prepare('SELECT COUNT(*) AS c FROM mak_bindings WHERE license_id=?').bind(license.id).first();
    assert.equal(Number(bound.c), 1);

    // A second bind must be rejected while the one app slot is occupied.
    assert.equal((await licenseAction({ action: 'binding_add', guest_id: String(guest.id) })).status, 303);
    bound = await env.DB.prepare('SELECT COUNT(*) AS c FROM mak_bindings WHERE license_id=?').bind(license.id).first();
    assert.equal(Number(bound.c), 1, 'max_apps is enforced');

    assert.equal((await licenseAction({ action: 'binding_remove', guest_id: String(guest.id) })).status, 303);
    bound = await env.DB.prepare('SELECT COUNT(*) AS c FROM mak_bindings WHERE license_id=?').bind(license.id).first();
    assert.equal(Number(bound.c), 0, 'explicit app removal frees the slot');
    assert.equal((await licenseAction({ action: 'binding_add', guest_id: String(guest.id) })).status, 303);

    const del = await call(env, '/sdk/guests/' + guest.id + '/action', {
      method: 'POST', cookie, body: form({ _csrf: token, action: 'delete' }),
    });
    assert.equal(del.status, 303);
    const gone = await env.DB.prepare('SELECT id FROM mak_guest_apps WHERE id=?').bind(guest.id).first();
    assert.equal(gone, null);
    bound = await env.DB.prepare('SELECT COUNT(*) AS c FROM mak_bindings WHERE guest_app_id=?').bind(guest.id).first();
    assert.equal(Number(bound.c), 0, 'global app delete cascades its bindings');
    const event = await env.DB.prepare("SELECT * FROM mak_events WHERE event_type='GUEST_DELETED' ORDER BY id DESC LIMIT 1").first();
    assert.ok(event, 'guest deletion is retained in the security log');
  });

  await test('custom-date and lifetime policies stay backward compatible', async () => {
    const env = globalThis.__lastEnv;
    const { cookie, token } = env.__test;
    const future = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    const custom = await issueLicense(env, cookie, token, {
      label: 'Legacy custom date', signature_bind: '0', duration: 'custom', expires_on: future,
    });
    assert.ok(custom.mak);
    const customRow = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();
    assert.equal(customRow.duration_days, null);
    assert.ok(Number(customRow.expires_at) > nowS());

    const life = await issueLicense(env, cookie, token, {
      label: 'Legacy lifetime', signature_bind: '0', duration: 'lifetime',
    });
    assert.ok(life.mak);
    const lifeRow = await env.DB.prepare('SELECT * FROM mak_licenses ORDER BY id DESC LIMIT 1').first();
    assert.equal(lifeRow.duration_days, null);
    assert.equal(lifeRow.expires_at, null);
    assert.equal(lifeRow.started_at, null);
  });

  await test('MAK/1 endpoints are removed', async () => {
    const env = globalThis.__lastEnv;
    const res = await call(env, '/mak/v1/challenge', { method: 'POST', json: { protocol: 'MAK/1' } });
    assert.equal(res.status, 410);
    const body = jsonBody(await res.text());
    assert.equal(body.code, 'PROTOCOL_REMOVED');
  });

  await test('panel generates MAK/2 keys from /sdk/server without Worker secrets', async () => {
    const env = makeEnv({ MAK_SIGNING_KEY: '', MAK_ENC_KEY: '' });
    globalThis.__panelKeyEnv = env;
    // A fresh D1 needs the schema even though ensureDB already ran once for
    // the first test database in this isolate.
    delete globalThis.__arcDbReady;

    const setup = await call(env, '/setup', {
      method: 'POST', body: form({ username: 'keyowner', password: 'supersecret123' }),
    });
    assert.equal(setup.status, 302, await setup.clone().text());
    const cookie = setCookie(setup);
    const settings = await call(env, '/sdk/settings', { cookie });
    const token = csrf(await settings.text());

    const before = await readStatus(env);
    assert.equal(before.signing_ready, false);
    assert.equal(before.encryption_ready, false);

    const page = await call(env, '/sdk/server', { cookie });
    const pageHtml = await page.text();
    assert.equal(page.status, 200);
    assert.match(pageHtml, /Generate MAK\/2 keys/);

    const generated = await call(env, '/sdk/server', {
      method: 'POST', cookie,
      body: form({ _csrf: token, action: 'generate_keys' }),
    });
    assert.equal(generated.status, 302);
    assert.match(String(generated.headers.get('Location') || ''), /ok=keys/);

    const after = await readStatus(env);
    assert.equal(after.signing_ready, true);
    assert.equal(after.encryption_ready, true);
    assert.equal(after.key_source, 'PANEL');
    assert.match(after.key_id, /^MAK-ED-[0-9A-F]{12}$/);
    assert.match(after.encryption_key_id, /^MAK-ENC-[0-9A-F]{12}$/);
    assert.equal(after.rotations.length, 0);

    const keys = await loadKeyConfig(env.DB, env, { force: true });
    assert.equal(keys.source, 'PANEL');
    assert.equal(keys.signing.active.key_id, after.key_id);
    assert.equal(keys.encryption.key_id, after.encryption_key_id);
    const rotatedPage = await call(env, '/sdk/server', { cookie });
    assert.match(await rotatedPage.text(), /Rotate MAK\/2 keys/);

    const issued = await issueLicense(env, cookie, token, { label: 'Panel Key License', signature_bind: '0' });
    const res = await panelEnvelopeCall(env, 'activate', {
      mak: issued.mak, package_name: 'com.panel.key', app_name: 'Panel Key Host',
      cert_sha256: 'd'.repeat(64),
    });
    assert.equal(res.body.decision, 'ALLOW');
    assert.equal(verifyWithProtocol(res.body.grant, res.keys.signing, 'MAK/2', 'GRANT'), true);
    env.__test = { cookie, token, oldKeyId: after.key_id, oldPublicKey: after.public_keys.find((k) => k.active).public_key };
  });

  await test('rotating panel keys publishes a signed chain that old installs can verify', async () => {
    const env = globalThis.__panelKeyEnv;
    const { cookie, token, oldKeyId, oldPublicKey } = env.__test;

    const rotated = await call(env, '/sdk/server', {
      method: 'POST', cookie,
      body: form({ _csrf: token, action: 'generate_keys' }),
    });
    assert.equal(rotated.status, 302);

    const status = await readStatus(env);
    assert.notEqual(status.key_id, oldKeyId);
    assert.equal(status.rotations.length, 1);
    const link = status.rotations[0];
    assert.equal(link.previous_key_id, oldKeyId);
    const statement = { ...link };
    delete statement.signature;
    assert.equal(nacl.sign.detached.verify(
      utf8('MAK/2\nROTATION\n' + canonicalJson(statement)),
      b64decode(link.signature),
      b64decode(oldPublicKey),
    ), true, 'rotation is signed by the previous key');
    const active = status.public_keys.find((key) => key.active);
    assert.equal(link.new_key_id, active.key_id);
    assert.equal(link.new_signing_public_key, active.public_key);
    assert.equal(link.new_encryption_key_id, status.encryption_key_id);
    assert.equal(link.new_encryption_public_key, status.encryption_public_key);

    const issued = await issueLicense(env, cookie, token, { label: 'Rotated Key License', signature_bind: '0' });
    const res = await panelEnvelopeCall(env, 'activate', {
      mak: issued.mak, package_name: 'com.rotated.key', app_name: 'Rotated Key Host',
      cert_sha256: 'e'.repeat(64),
    });
    assert.equal(res.body.decision, 'ALLOW');
    assert.equal(res.keys.signing.active.key_id, status.key_id);
    assert.equal(verifyWithProtocol(res.body.grant, res.keys.signing, 'MAK/2', 'GRANT'), true);
  });

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed\n');
  if (failed.length) process.exitCode = 1;
}

await main();
