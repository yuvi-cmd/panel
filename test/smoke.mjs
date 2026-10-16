// Smoke / integration tests for the Worker (no external deps).
// Uses Node's built-in SQLite (node:sqlite) behind a tiny D1-compatible shim
// and drives the Worker's fetch() end-to-end: auth, tenant isolation,
// key lifecycle, referral role coercion, connect/encrypt contracts.
//
// Run:  node test/smoke.mjs   (Node >= 22.5; Node 26 recommended)

import { DatabaseSync } from 'node:sqlite';
import app from '../src/index.js';

// ---------- minimal D1 shim over node:sqlite ----------
function makeDb() {
  const sqlite = new DatabaseSync(':memory:');
  const wrap = (stmt, args) => ({
    async first() {
      try {
        return stmt.get(...args) ?? null;
      } catch {
        return null;
      }
    },
    async all() {
      try {
        return { results: stmt.all(...args) };
      } catch {
        return { results: [] };
      }
    },
    async run() {
      const info = stmt.run(...args);
      return { meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } };
    },
  });
  return {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const bound = (...args) => wrap(stmt, args);
      return { bind: bound, first: () => bound().first(), all: () => bound().all(), run: () => bound().run() };
    },
    async exec(sql) {
      sqlite.exec(sql);
    },
  };
}

// ---------- tiny test runner ----------
let passed = 0;
let failed = 0;
function ok(cond, name, extra) {
  if (cond) {
    passed += 1;
    console.log('  ok - ' + name);
  } else {
    failed += 1;
    console.error('  FAIL - ' + name + (extra ? ' :: ' + extra : ''));
  }
}

function cookieFrom(res) {
  const h = res.headers.get('Set-Cookie') || '';
  const m = h.match(/sdk_session=([^;]+)/);
  return m ? `sdk_session=${m[1]}` : '';
}

async function call(env, method, path, { cookie, json, form, headers } = {}) {
  const url = 'https://panel.test' + path;
  const h = { ...(headers || {}) };
  if (cookie) h.Cookie = cookie;
  let body;
  if (json !== undefined) {
    h['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    body = form; // FormData
  }
  const req = new Request(url, { method, headers: h, body });
  return app.fetch(req, env, {});
}

const env = { DB: makeDb(), PANEL_CODE: 'YUVI_001', PANEL_NAME: 'TEST PANEL' };

// ---------- 1. setup ----------
console.log('setup + auth');
{
  const r = await call(env, 'GET', '/setup');
  ok(r.status === 200, 'GET /setup renders when empty');
  const fd = new FormData();
  fd.set('username', 'boss');
  fd.set('password', 'secret123');
  const r2 = await call(env, 'POST', '/setup', { form: fd });
  ok(r2.status === 302 && r2.headers.get('Location') === '/dashboard', 'POST /setup creates first OWNER');
  var ownerCookie = cookieFrom(r2);
  ok(!!ownerCookie, 'setup sets session cookie');
}

// ---------- 2. JSON login + dashboard ----------
console.log('json api auth');
{
  const r = await call(env, 'POST', '/api/login', { json: { username: 'boss', password: 'secret123', device_info: '{}' } });
  ok(r.status === 200, 'POST /api/login 200');
  const b = await r.json();
  ok(b.ok === true && b.user.role === 'OWNER', 'login returns OWNER user', JSON.stringify(b).slice(0, 120));
  var ownerApiCookie = cookieFrom(r) || ownerCookie;
  ok(!!ownerApiCookie, 'login sets session cookie');

  const d = await call(env, 'GET', '/api/dashboard', { cookie: ownerApiCookie });
  const db = await d.json();
  ok(d.status === 200 && db.ok === true && typeof db.stats === 'object', 'GET /api/dashboard ok');
  ok(!('BCORE_SECRET' in db) && !('aes_key' in db), 'dashboard leaks no secrets');

  const anon = await call(env, 'GET', '/api/dashboard');
  ok(anon.status === 401, 'dashboard requires auth');
}

// ---------- 3. generate + keys ----------
console.log('keys lifecycle');
let keyId = 0;
{
  const g = await call(env, 'POST', '/api/generate', { cookie: ownerCookie, json: { duration: '30D', device_limit: 1, bulk_amount: 2 } });
  const gb = await g.json();
  ok(g.status === 200 && gb.ok === true && gb.keys.length === 2, 'generate 2 keys', JSON.stringify(gb).slice(0, 160));
  var keyA = gb.keys[0];

  const k = await call(env, 'GET', '/api/keys?page=1&pageSize=20', { cookie: ownerCookie });
  const kb = await k.json();
  ok(kb.ok === true && kb.total === 2, 'keys list total=2');
  keyId = kb.items[0].id;
  ok(typeof kb.items[0].expires_at_ist !== 'undefined', 'keys include IST display field');

  const bad = await call(env, 'POST', '/api/generate', { cookie: ownerCookie, json: { duration: 'NOPE', device_limit: 1, bulk_amount: 1 } });
  ok(bad.status === 400, 'invalid duration rejected');
}

// ---------- 4. /users POST no longer crashes (ReferenceError fix) ----------
console.log('users admin');
{
  // owner creates a referral, then a reseller registers
  const ref = await call(env, 'POST', '/api/referral', { cookie: ownerCookie, json: { action: 'generate', role: 'RESELLER', duration: 30, balance: 100 } });
  const refb = await ref.json();
  ok(refb.ok === true && /^REF-/.test(refb.code), 'referral generated');
  ok(refb.role === 'RESELLER', 'referral role respected');

  // OWNER-role referral must NOT be mintable anymore
  const ref2 = await call(env, 'POST', '/api/referral', { cookie: ownerCookie, json: { action: 'generate', role: 'OWNER', duration: 30, balance: 0 } });
  const ref2b = await ref2.json();
  ok(ref2b.ok === true && ref2b.role !== 'OWNER', 'OWNER referral coerced, got ' + ref2b.role);

  const fd = new FormData();
  fd.set('full_name', 'Res Eller');
  fd.set('username', 'res1');
  fd.set('password', 'pass1234');
  fd.set('referral_code', refb.code);
  const reg = await call(env, 'POST', '/register', { form: fd });
  ok(reg.status === 302, 'register with referral redirects');

  const users = await call(env, 'GET', '/api/users', { cookie: ownerCookie });
  const ub = await users.json();
  const res1 = ub.items.find((u) => u.username === 'res1');
  ok(!!res1 && res1.role === 'RESELLER', 'reseller registered in panel');

  // block toggle (this POST crashed before the fix)
  const t = await call(env, 'POST', '/api/users', { cookie: ownerCookie, json: { action: 'toggle_block', target_id: res1.id } });
  const tb = await t.json();
  ok(t.status === 200 && tb.ok === true, 'toggle_block works (no ReferenceError)');

  // legacy OWNER-role referral in DB must coerce to non-OWNER on register
  env.DB.prepare("INSERT INTO referrals (code,role,duration,balance,panel_code,created_by) VALUES ('REF-LEGACY-OWNER','OWNER',30,0,'YUVI_001',1)").bind().run();
  const fd2 = new FormData();
  fd2.set('full_name', 'Legacy Owner');
  fd2.set('username', 'leg1');
  fd2.set('password', 'pass1234');
  fd2.set('referral_code', 'REF-LEGACY-OWNER');
  await call(env, 'POST', '/register', { form: fd2 });
  const users2 = await call(env, 'GET', '/api/users', { cookie: ownerCookie });
  const ub2 = await users2.json();
  const leg = ub2.items.find((u) => u.username === 'leg1');
  ok(!!leg && leg.role !== 'OWNER', 'legacy OWNER referral coerced to ' + (leg && leg.role));
}

// ---------- 5. tenant isolation ----------
console.log('tenant isolation');
let panel2KeyId = 0;
{
  const c = await call(env, 'POST', '/api/panels', { cookie: ownerCookie, json: { action: 'create', custom_code: 'PANEL_TWO', duration: 30 } });
  ok(c.status === 200, 'second panel created');

  const fd = new FormData();
  fd.set('panel_code', 'PANEL_TWO');
  fd.set('username', 'boss2');
  fd.set('password', 'secret123');
  const j = await call(env, 'POST', '/join-panel', { form: fd });
  ok(j.status === 302, 'second panel claimed');

  const l2 = await call(env, 'POST', '/api/login', { json: { username: 'boss2', password: 'secret123', device_info: '{}' } });
  const l2c = cookieFrom(l2);
  ok(l2.status === 200 && !!l2c, 'second owner login');

  const g2 = await call(env, 'POST', '/api/generate', { cookie: l2c, json: { duration: '7D', device_limit: 1, bulk_amount: 1 } });
  const g2b = await g2.json();
  ok(g2b.ok === true && g2b.keys.length === 1, 'panel2 key generated');

  const k2 = await call(env, 'GET', '/api/keys', { cookie: l2c });
  panel2KeyId = (await k2.json()).items[0].id;

  // panel1 owner must NOT see panel2 keys
  const k1 = await call(env, 'GET', '/api/keys', { cookie: ownerCookie });
  const k1b = await k1.json();
  const leak = k1b.items.some((x) => x.id === panel2KeyId);
  ok(!leak, 'no cross-tenant key read');

  // ...nor mutate them
  const del = await call(env, 'POST', '/api/keys', { cookie: ownerCookie, json: { action: 'delete_key', key_id: panel2KeyId } });
  ok(del.status === 403, 'cross-tenant key delete forbidden');

  const still = await call(env, 'GET', '/api/keys', { cookie: l2c });
  ok((await still.json()).total === 1, 'panel2 key intact');
}

// ---------- 6. connect / encrypt contracts ----------
console.log('connect + encrypt');
{
  const fd = new FormData();
  fd.set('game', 'PUBG');
  // fetch key_value of first panel1 key directly
  const row = await env.DB.prepare('SELECT key_value FROM api_keys WHERE panel_code=? LIMIT 1').bind('YUVI_001').first();
  fd.set('user_key', row.key_value);
  fd.set('serial', 'DEV-001');
  const c = await call(env, 'POST', '/connect/YUVI_001', { form: fd });
  const cb = await c.json();
  ok(c.status === 200 && cb.status === true && cb.data && cb.data.lib_url, 'connect ok returns lib_url');

  const fdBad = new FormData();
  fdBad.set('game', 'OTHER');
  fdBad.set('user_key', 'x');
  fdBad.set('serial', 'y');
  const cbad = await call(env, 'POST', '/connect/YUVI_001', { form: fdBad });
  ok(cbad.status === 403, 'non-PUBG game rejected');

  const e = await call(env, 'POST', '/encrypt/YUVI_001', { form: fd });
  ok(e.status === 403, 'encrypt blocked before panel activation');

  // activate panel2? no — activate YUVI_001 via voucher + AES config
  env.DB.prepare("INSERT INTO activation_keys (activation_key,panel_code,name,duration_months,expires_at) VALUES ('VOUCHER-1','YUVI_001','t',1,'2099-01-01 00:00:00')").bind().run();
  const a = await call(env, 'POST', '/api/activate', { cookie: ownerCookie, json: { activation_key: 'voucher-1' } });
  ok(a.status === 200, 'activation redeem (case-insensitive)');
  env.DB.prepare("INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES ('aes_key',?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value").bind('a'.repeat(64), 'YUVI_001').run();
  env.DB.prepare("INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES ('aes_iv',?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value").bind('b'.repeat(32), 'YUVI_001').run();
  const e2 = await call(env, 'POST', '/encrypt/YUVI_001', { form: fd });
  const e2b = await e2.json();
  ok(e2.status === 200 && e2b.status === true && typeof e2b.payload === 'string', 'encrypt returns payload after activation+aes');

  // panels created with a duration honour panels.expires_at without voucher
  env.DB.prepare("INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES ('aes_key',?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value").bind('c'.repeat(64), 'PANEL_TWO').run();
  env.DB.prepare("INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES ('aes_iv',?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value").bind('d'.repeat(32), 'PANEL_TWO').run();
  const k2row = await env.DB.prepare('SELECT key_value FROM api_keys WHERE panel_code=? LIMIT 1').bind('PANEL_TWO').first();
  const fd2 = new FormData();
  fd2.set('game', 'PUBG');
  fd2.set('user_key', k2row.key_value);
  fd2.set('serial', 'DEV-002');
  const e3 = await call(env, 'POST', '/encrypt/PANEL_TWO', { form: fd2 });
  const e3b = await e3.json();
  ok(e3.status === 200 && e3b.status === true && typeof e3b.payload === 'string', 'encrypt honours panels.expires_at (no voucher needed)');
  // ...but an expired panel duration still blocks
  await env.DB.prepare("UPDATE panels SET expires_at='2000-01-01 00:00:00' WHERE panel_code='PANEL_TWO'").bind().run();
  const e4 = await call(env, 'POST', '/encrypt/PANEL_TWO', { form: fd2 });
  ok(e4.status === 403 && (await e4.json()).reason === 'PANEL NOT ACTIVATED', 'expired panel duration blocks encrypt');
}

// ---------- 7. bcore tenant-squatting fix + crypto helpers ----------
console.log('bcore + crypto');
{
  const before = env.DB.prepare("SELECT COUNT(*) c FROM panels WHERE panel_code='EVIL_PANEL'").bind().first();
  const r = await call(env, 'POST', '/sdk/bcore/EVIL_PANEL', { headers: { 'Content-Type': 'text/plain' }, });
  // send empty body via Request text path
  void r;
  const req = new Request('https://panel.test/sdk/bcore/EVIL_PANEL', { method: 'POST', body: 'e30=' });
  const res = await app.fetch(req, env, {});
  ok(res.status === 404, 'bcore unknown panel rejected, got ' + res.status);
  const after = env.DB.prepare("SELECT COUNT(*) c FROM panels WHERE panel_code='EVIL_PANEL'").bind().first();
  ok((before?.c || 0) === 0 && (after?.c || 0) === 0, 'bcore does not auto-create panels');

  const { esc } = await import('../src/ui.js');
  ok(esc(`a'b"c<d>`) === 'a&#x27;b&quot;c&lt;d&gt;', 'esc() escapes quotes + tags');
  const { formatIST, cleanPanelCode } = await import('../src/security.js');
  ok(formatIST('2026-01-01 00:00:00').length > 0, 'formatIST renders');
  ok(cleanPanelCode('yuvi_001 ') === 'YUVI_001' && cleanPanelCode('a-b') === '', 'panel code validation');
  const { hashPassword, verifyPassword, bcoreEncrypt, bcoreDecrypt } = await import('../src/crypto.js');
  const h = await hashPassword('pw123');
  ok(await verifyPassword('pw123', h) && !(await verifyPassword('nope', h)), 'password hash roundtrip');
  const enc = bcoreEncrypt('{"sdk_key":"x"}');
  ok(bcoreDecrypt(enc).toString('utf8') === '{"sdk_key":"x"}', 'bcore rc4 roundtrip (compat)');
}

// ---------- 7b. UI themes (settings picker + allowlist) ----------
console.log('ui themes');
{
  const setTheme = async (v) => {
    const fd = new FormData();
    fd.set('action', 'update_theme');
    fd.set('ui_theme', v);
    const r = await call(env, 'POST', '/settings', { cookie: ownerCookie, form: fd });
    return await r.text();
  };
  for (const t of ['violet', 'orange', 'cyan', 'mono', 'blue']) {
    const html = await setTheme(t);
    ok(html.includes('data-theme="' + t + '"'), 'theme applies: ' + t);
  }
  const bad = await setTheme('hacker');
  ok(bad.includes('Invalid theme'), 'invalid theme rejected');
  const page = await (await call(env, 'GET', '/settings', { cookie: ownerCookie })).text();
  ok(['Ocean Blue', 'Royal Violet', 'Ocean Cyan', 'Emerald', 'Sunset Orange', 'Cherry Red', 'Royal Golden', 'Mono White'].every((n) => page.includes(n)), 'all 8 themes in picker');
}

// ---------- 7c. custom accent color (per-panel isolated) ----------
console.log('custom accent');
{
  const setCustom = async (cookie, v) => {
    const fd = new FormData();
    fd.set('action', 'update_theme');
    fd.set('ui_theme', 'custom');
    fd.set('ui_accent', v);
    const r = await call(env, 'POST', '/settings', { cookie, form: fd });
    return await r.text();
  };
  const html = await setCustom(ownerCookie, '#123abc');
  ok(html.includes('data-theme="custom"') && html.includes('--acc:#123abc'), 'custom accent applies with inline vars');
  const bad = await setCustom(ownerCookie, 'red');
  ok(bad.includes('Invalid color'), 'bad hex rejected');
  const bad2 = await setCustom(ownerCookie, '#12ab45;evil');
  ok(bad2.includes('Invalid color'), 'injection-ish value rejected');
  // tenant isolation: PANEL_TWO picks its own color, YUVI_001 keeps its own
  const l2 = await call(env, 'POST', '/api/login', { json: { username: 'boss2', password: 'secret123', device_info: '{}' } });
  const c2 = cookieFrom(l2) || '';
  ok(!!c2, 'panel2 login for isolation check');
  await setCustom(c2, '#ff0000');
  const p1 = await (await call(env, 'GET', '/dashboard', { cookie: ownerCookie })).text();
  const p2 = await (await call(env, 'GET', '/dashboard', { cookie: c2 })).text();
  ok(p1.includes('--acc:#123abc') && !p1.includes('--acc:#ff0000'), 'panel1 keeps its own accent');
  ok(p2.includes('--acc:#ff0000') && !p2.includes('--acc:#123abc'), 'panel2 keeps its own accent');
  const sp = await (await call(env, 'GET', '/settings', { cookie: ownerCookie })).text();
  ok(sp.includes('Custom color') && sp.includes('#123abc'), 'picker shows current custom color');
}

// ---------- 7d. legacy DB self-heal (old DB + real key must not 500) ----------
// Simulates a pre-column database: tables exist but lack columns the hot
// path writes (key_devices.panel_code, api_keys.expires_at/uses, ...).
// ensureDB must heal via ALTERs; /connect + /encrypt must then succeed.
console.log('legacy db heal');
{
  const { DatabaseSync } = await import('node:sqlite');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'RESELLER', panel_code TEXT NOT NULL DEFAULT 'YUVI_001', balance INTEGER NOT NULL DEFAULT 0, created_at TEXT);
    CREATE TABLE panels (panel_code TEXT PRIMARY KEY, is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, key_value TEXT NOT NULL, duration TEXT NOT NULL DEFAULT '30D', device_limit INTEGER NOT NULL DEFAULT 1, panel_code TEXT NOT NULL DEFAULT 'YUVI_001', created_by INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE key_devices (key_id INTEGER NOT NULL, device_uuid TEXT NOT NULL, PRIMARY KEY (key_id, device_uuid));
    CREATE TABLE mod_settings (setting_name TEXT NOT NULL, setting_value TEXT, panel_code TEXT NOT NULL, PRIMARY KEY (setting_name, panel_code));
  `);
  const wrap = (s, a) => ({
    first: async () => { try { return s.get(...a) ?? null; } catch { return null; } },
    all: async () => { try { return { results: s.all(...a) }; } catch { return { results: [] }; } },
    run: async () => { const i = s.run(...a); return { meta: { last_row_id: Number(i.lastInsertRowid), changes: i.changes } }; },
  });
  const db2 = {
    prepare: (sql) => { const st = sqlite.prepare(sql); const b = (...a) => wrap(st, a); return { bind: b, first: () => b().first(), all: () => b().all(), run: () => b().run() }; },
    exec: async (sql) => sqlite.exec(sql),
  };
  const env2 = { DB: db2, PANEL_CODE: 'YUVI_001', PANEL_NAME: 'T' };
  const call2 = async (method, path, opts = {}) => {
    const h = { ...(opts.headers || {}) };
    if (opts.cookie) h.Cookie = opts.cookie;
    let body;
    if (opts.json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(opts.json); }
    else if (opts.form !== undefined) body = opts.form;
    return app.fetch(new Request('https://panel.test' + path, { method, headers: h, body }), env2, {});
  };
  const { hashPassword: hp } = await import('../src/crypto.js');
  await db2.prepare("INSERT INTO users (username,password_hash,role,panel_code) VALUES (?,?,?,?)").bind('oldboss', await hp('pw1234'), 'OWNER', 'YUVI_001').run();
  await db2.prepare("INSERT INTO panels (panel_code,is_active) VALUES ('YUVI_001',1)").run();
  await db2.prepare("INSERT INTO api_keys (key_value,duration,device_limit,panel_code,created_by) VALUES ('30D-LEGACYKEY01', '30D',1,'YUVI_001',1)").run();
  globalThis.__arcDbReady = ''; // force ensureDB to run (and heal) on this DB
  const fd = new FormData();
  fd.set('game', 'PUBG');
  fd.set('user_key', '30D-LEGACYKEY01');
  fd.set('serial', 'OLDDEV');
  const c = await call2('POST', '/connect/YUVI_001', { form: fd });
  const cb = await c.json().catch(() => ({}));
  ok(c.status === 200 && cb.status === true, 'legacy DB: connect binds device without 500 (got ' + c.status + ')');
  await db2.prepare("UPDATE panels SET expires_at='2099-01-01 00:00:00' WHERE panel_code='YUVI_001'").bind().run();
  await db2.prepare("INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES ('aes_key',?,?)").bind('e'.repeat(64), 'YUVI_001').run();
  await db2.prepare("INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES ('aes_iv',?,?)").bind('f'.repeat(32), 'YUVI_001').run();
  const e = await call2('POST', '/encrypt/YUVI_001', { form: fd });
  const eb = await e.json().catch(() => ({}));
  ok(e.status === 200 && eb.status === true && typeof eb.payload === 'string', 'legacy DB: encrypt returns payload after heal');
  globalThis.__arcDbReady = '';
}

// ---------- 7e. fresh install: empty DB auto-creates full schema ----------
// Proves zero-manual-SQL setup: first request builds all 18 tables + indexes.
console.log('fresh install');
{
  const { DatabaseSync: D3 } = await import('node:sqlite');
  const sqlite3 = new D3(':memory:'); // zero tables
  const wrap3 = (s, a) => ({
    first: async () => { try { return s.get(...a) ?? null; } catch { return null; } },
    all: async () => { try { return { results: s.all(...a) }; } catch { return { results: [] }; } },
    run: async () => { const i = s.run(...a); return { meta: { last_row_id: Number(i.lastInsertRowid), changes: i.changes } }; },
  });
  const db3 = {
    prepare: (sql) => { const st = sqlite3.prepare(sql); const b = (...a) => wrap3(st, a); return { bind: b, first: () => b().first(), all: () => b().all(), run: () => b().run() }; },
    exec: async (sql) => sqlite3.exec(sql),
  };
  const env3 = { DB: db3, PANEL_CODE: 'YUVI_001', PANEL_NAME: 'T' };
  globalThis.__arcDbReady = ''; // force cold-start path
  const r0 = await app.fetch(new Request('https://panel.test/setup'), env3, {});
  ok(r0.status === 200, 'GET /setup renders on empty DB (got ' + r0.status + ')');
  const tables = (await db3.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()).results.map((r) => r.name).sort();
  const want = ['activation_keys', 'api_keys', 'bcore_key_bindings', 'bcore_keys', 'key_devices', 'loader_config', 'loader_files', 'mod_loaders', 'mod_maintenance', 'mod_settings', 'mundo_key_bindings', 'mundo_keys', 'panels', 'referrals', 'sdk_hash_vault', 'sdk_server_status', 'sessions', 'users'];
  ok(JSON.stringify(tables) === JSON.stringify(want), 'all 18 tables auto-created (' + tables.length + '/18)');
  const idx = (await db3.prepare("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all()).results.map((r) => r.name);
  ok(['idx_users_panel', 'idx_api_panel', 'idx_dev_panel', 'idx_sess_user'].every((n) => idx.includes(n)), 'indexes auto-created');
  const fd = new FormData();
  fd.set('username', 'freshboss');
  fd.set('password', 'pw1234');
  const r1 = await app.fetch(new Request('https://panel.test/setup', { method: 'POST', body: fd }), env3, {});
  const ck3 = (r1.headers.get('Set-Cookie') || '').match(/sdk_session=([^;]+)/)?.[0] || '';
  ok(r1.status === 302 && !!ck3, 'first admin created with zero manual SQL');
  const d3 = await app.fetch(new Request('https://panel.test/dashboard', { headers: { Cookie: ck3 } }), env3, {});
  ok(d3.status === 200, 'dashboard works right after auto-setup');
  globalThis.__arcDbReady = '';
}

// ---------- 8. inline-script audit: every rendered page's scripts must parse ----------
// A single broken <script> kills the whole tag (sidebar toggle, copy buttons,
// filters). node --check cannot see inside template literals, so audit the
// actual rendered HTML.
console.log('inline script audit');
{
  const htmlPaths = ['/login', '/register', '/reset-device', '/join-panel', '/dashboard', '/generate', '/keys', '/users', '/admins', '/permissions', '/referral', '/aes', '/api-test', '/server', '/settings', '/loader-manager', '/create-panel', '/sdk', '/sdk/generate', '/sdk/keys', '/sdk/server', '/sdk/hash'];
  let checked = 0;
  for (const p of htmlPaths) {
    const r = await call(env, 'GET', p, { cookie: ownerCookie });
    const t = await r.text();
    if (!t.includes('<script')) { ok(false, p + ' has no scripts'); continue; }
    const blocks = [...t.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.trim());
    if (!blocks.length) { ok(false, p + ' script extraction empty'); continue; }
    let bad = null;
    for (const code of blocks) {
      try { new Function(code); checked += 1; }
      catch (e) { bad = e.message + ' :: ' + code.slice(0, 140); break; }
    }
    ok(!bad, p + ' inline scripts parse (' + blocks.length + ' blocks)' + (bad ? ' :: ' + bad : ''));
  }
  ok(checked > 20, 'audited ' + checked + ' inline script blocks');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
