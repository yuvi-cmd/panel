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
  ok(r2.status === 302 && r2.headers.get('Location') === '/dashboard', 'POST /setup creates main owner');
  var ownerCookie = cookieFrom(r2);
  ok(!!ownerCookie, 'setup sets session cookie');
  const mainRole = ((await env.DB.prepare('SELECT role FROM users WHERE id=1').bind().first()) || {}).role;
  ok(mainRole === 'PROFESSOR', 'main owner id 1 is the single PROFESSOR (got ' + mainRole + ')');
}

// ---------- 2. JSON login + dashboard ----------
console.log('json api auth');
{
  const r = await call(env, 'POST', '/api/login', { json: { username: 'boss', password: 'secret123', device_info: '{}' } });
  ok(r.status === 200, 'POST /api/login 200');
  const b = await r.json();
  ok(b.ok === true && b.user.role === 'PROFESSOR', 'login returns PROFESSOR (main owner)', JSON.stringify(b).slice(0, 120));
  var ownerApiCookie = cookieFrom(r) || ownerCookie;
  ok(!!ownerApiCookie, 'login sets session cookie');

  const d = await call(env, 'GET', '/api/dashboard', { cookie: ownerApiCookie });
  const db = await d.json();
  ok(d.status === 200 && db.ok === true && typeof db.stats === 'object', 'GET /api/dashboard ok');
  ok(!('BCORE_SECRET' in db) && !('aes_key' in db), 'dashboard leaks no secrets');

  const anon = await call(env, 'GET', '/api/dashboard');
  ok(anon.status === 401, 'dashboard requires auth');
  const h = await call(env, 'GET', '/api/health');
  const hb = await h.json();
  ok(h.status === 200 && hb.ok === true && typeof hb.v === 'string', 'health reports running version (' + hb.v + ')');
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

  // v1.3: owner may mint OWNER-role referrals (partner panel owners)
  const ref2 = await call(env, 'POST', '/api/referral', { cookie: ownerCookie, json: { action: 'generate', role: 'OWNER', duration: 30, balance: 0 } });
  const ref2b = await ref2.json();
  ok(ref2b.ok === true && ref2b.role === 'OWNER', 'owner mints OWNER referral');

  // PROFESSOR must never be mintable (single main professor)
  const refP = await call(env, 'POST', '/api/referral', { cookie: ownerCookie, json: { action: 'generate', role: 'PROFESSOR', duration: 30, balance: 0 } });
  const refPb = await refP.json();
  ok(refPb.ok === true && refPb.role === 'RESELLER', 'PROFESSOR referral coerced to RESELLER');

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

  // v1.3: owner-minted OWNER referral registers as OWNER
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
  ok(!!leg && leg.role === 'OWNER', 'owner-minted OWNER referral -> OWNER account');

  // admin-minted OWNER-role code stays RESELLER-only (no escalation)
  env.DB.prepare("INSERT INTO users (full_name,username,password_hash,role,panel_code) VALUES ('Ad Min','adm1','x','ADMIN','YUVI_001')").bind().run();
  const adm1 = (await env.DB.prepare("SELECT id FROM users WHERE username='adm1'").bind().first()) || {};
  env.DB.prepare("INSERT INTO referrals (code,role,duration,balance,panel_code,created_by) VALUES ('REF-ADMIN-OWNER','OWNER',30,0,'YUVI_001',?)").bind(adm1.id).run();
  const fd3 = new FormData();
  fd3.set('full_name', 'Adm Child');
  fd3.set('username', 'admleg1');
  fd3.set('password', 'pass1234');
  fd3.set('referral_code', 'REF-ADMIN-OWNER');
  await call(env, 'POST', '/register', { form: fd3 });
  const users3 = await call(env, 'GET', '/api/users', { cookie: ownerCookie });
  const ub3 = await users3.json();
  const admleg = ub3.items.find((u) => u.username === 'admleg1');
  ok(!!admleg && admleg.role === 'RESELLER', 'admin-minted OWNER code coerced to RESELLER');

  // admin referral quota: owner sets limit, admin exhausts + gets blocked
  const refA = await call(env, 'POST', '/api/referral', { cookie: ownerCookie, json: { action: 'generate', role: 'ADMIN', duration: 30, balance: 0 } });
  const refAb = await refA.json();
  ok(refAb.ok === true && refAb.role === 'ADMIN', 'owner mints ADMIN referral');
  const fda = new FormData();
  fda.set('full_name', 'Admin Quota');
  fda.set('username', 'adm2');
  fda.set('password', 'pass1234');
  fda.set('referral_code', refAb.code);
  await call(env, 'POST', '/register', { form: fda });
  const lr = await call(env, 'POST', '/api/login', { json: { username: 'adm2', password: 'pass1234', device_info: '{}' } });
  const adm2Cookie = cookieFrom(lr);
  ok(!!adm2Cookie, 'admin2 can login');
  const g1 = await call(env, 'POST', '/api/referral', { cookie: adm2Cookie, json: { action: 'generate', role: 'OWNER', duration: 30, balance: 0 } });
  const g1b = await g1.json();
  ok(g1.status === 200 && g1b.role === 'RESELLER', 'admin can mint only RESELLER (got ' + (g1b.role || g1.status) + ')');
  const users4 = await call(env, 'GET', '/api/users', { cookie: ownerCookie });
  const ub4 = await users4.json();
  const adm2 = ub4.items.find((u) => u.username === 'adm2');
  const qf = new FormData();
  qf.set('target_id', String(adm2.id));
  qf.set('action', 'update_limit');
  qf.set('ref_limit', '1');
  const qr = await call(env, 'POST', '/referral', { cookie: ownerCookie, form: qf });
  ok(qr.status === 200, 'owner sets admin referral quota from referral page');
  const g2 = await call(env, 'POST', '/api/referral', { cookie: adm2Cookie, json: { action: 'generate', role: 'RESELLER', duration: 30, balance: 0 } });
  const g2b = await g2.json();
  ok(g2.status === 403 && /limit reached/.test(g2b.error || ''), 'admin blocked after quota exhausted (got ' + g2.status + ')');
}

// ---------- 4b. tenant account limit + auto-join (Tenants page) ----------
console.log('tenant account limit + auto join');
{
  const mkPanel = async (code, lim) => {
    const fd = new FormData();
    fd.set('action', 'create');
    fd.set('custom_code', code);
    fd.set('duration', '30');
    fd.set('account_limit', String(lim));
    return call(env, 'POST', '/create-panel', { form: fd, cookie: ownerCookie });
  };
  const setLimit = async (code, lim) => {
    const fd = new FormData();
    fd.set('action', 'set_limit');
    fd.set('target_panel', code);
    fd.set('account_limit', String(lim));
    return call(env, 'POST', '/create-panel', { form: fd, cookie: ownerCookie });
  };
  const autoOn = async (code) => {
    const fd = new FormData();
    fd.set('action', 'auto_join');
    fd.set('target_panel', code);
    return call(env, 'POST', '/create-panel', { form: fd, cookie: ownerCookie });
  };
  const panelRow = async (code) => env.DB.prepare('SELECT account_limit, auto_join FROM panels WHERE panel_code=?').bind(code).first();

  const c1 = await mkPanel('LIMITED', 2);
  ok(c1.status === 200, '/create-panel with account limit renders');
  const p1 = await panelRow('LIMITED');
  ok(p1 && (p1.account_limit | 0) === 2 && (p1.auto_join | 0) === 0, 'panel created with account_limit=2');

  await setLimit('LIMITED', 5);
  ok((((await panelRow('LIMITED')) || {}).account_limit | 0) === 5, 'limit increased to 5 (DB)');
  await setLimit('LIMITED', 0);
  ok((((await panelRow('LIMITED')) || {}).account_limit | 0) === 0, 'limit back to unlimited (0)');

  await autoOn('LIMITED');
  const jh1 = await (await call(env, 'GET', '/join-panel')).text();
  ok(jh1.includes('value="LIMITED"'), 'join page prefills auto tenant code');
  ok(jh1.includes('readonly') && jh1.includes('locked hai'), 'join page locks panel code when default set');
  ok((((await panelRow('LIMITED')) || {}).auto_join | 0) === 1, 'auto_join=1 saved in DB');

  await mkPanel('AUTO2', 0);
  await autoOn('AUTO2');
  ok((((await panelRow('LIMITED')) || {}).auto_join | 0) === 0, 'auto-join is single-winner (first cleared)');
  const jh2 = await (await call(env, 'GET', '/join-panel')).text();
  ok(jh2.includes('value="AUTO2"'), 'join page follows latest auto tenant');
  await autoOn('AUTO2');
  const noAuto = (await env.DB.prepare('SELECT panel_code FROM panels WHERE auto_join=1').bind().all()).results;
  const jh3 = await (await call(env, 'GET', '/join-panel')).text();
  ok(noAuto.length === 0 && !jh3.includes('value="AUTO2"') && !jh3.includes('readonly'), 'auto-join toggles off cleanly (code editable again)');

  await mkPanel('LIM3', 2);
  env.DB.prepare("INSERT INTO users (full_name,username,password_hash,role,panel_code) VALUES ('U1','lim_u1','x','RESELLER','LIM3')").bind().run();
  env.DB.prepare("INSERT INTO users (full_name,username,password_hash,role,panel_code) VALUES ('U2','lim_u2','x','RESELLER','LIM3')").bind().run();
  const jfd = new FormData();
  jfd.set('panel_code', 'LIM3');
  jfd.set('username', 'lim_owner');
  jfd.set('password', 'pass1234');
  const jres = await call(env, 'POST', '/join-panel', { form: jfd });
  const jhtml = await jres.text();
  ok(jres.status === 200 && jhtml.includes('account limit full'), 'join blocked when tenant limit full (2/2)');
  await setLimit('LIM3', 3);
  const jres2 = await call(env, 'POST', '/join-panel', { form: jfd });
  ok(jres2.status === 302, 'join allowed after limit increased');
  ok((((await panelRow('LIM3')) || {}).account_limit | 0) === 3, 'pre-set limit respected on claim');

  env.DB.prepare("INSERT INTO referrals (code,role,duration,balance,panel_code,created_by) VALUES ('REF-LIM3','RESELLER',30,0,'LIM3',1)").bind().run();
  const rfd = new FormData();
  rfd.set('full_name', 'Extra User');
  rfd.set('username', 'lim_extra');
  rfd.set('password', 'pass1234');
  rfd.set('referral_code', 'REF-LIM3');
  const rres = await call(env, 'POST', '/register', { form: rfd });
  const rhtml = await rres.text();
  ok(rres.status === 200 && rhtml.includes('account limit full'), 'referral register blocked when tenant full (3/3)');
  await setLimit('LIM3', 4);
  const rres2 = await call(env, 'POST', '/register', { form: rfd });
  ok(rres2.status === 302, 'referral register allowed after limit increase');

  // claimed owner panel defaults to exactly one account (owner only)
  const claimFd = new FormData();
  claimFd.set('panel_code', 'AUTO2');
  claimFd.set('username', 'auto2_owner');
  claimFd.set('password', 'pass1234');
  const claim = await call(env, 'POST', '/join-panel', { form: claimFd });
  ok(claim.status === 302, 'AUTO2 claimed as owner');
  ok((((await panelRow('AUTO2')) || {}).account_limit | 0) === 1, 'claimed panel defaults to 1 account (owner only)');
  const claim2Fd = new FormData();
  claim2Fd.set('panel_code', 'AUTO2');
  claim2Fd.set('username', 'auto2_second');
  claim2Fd.set('password', 'pass1234');
  const claim2 = await call(env, 'POST', '/join-panel', { form: claim2Fd });
  const claim2html = await claim2.text();
  ok(claim2.status === 200 && claim2html.includes('already claimed'), 'second claim blocked (one owner per panel)');
  env.DB.prepare("INSERT INTO referrals (code,role,duration,balance,panel_code,created_by) VALUES ('REF-AUTO2','RESELLER',30,0,'AUTO2',1)").bind().run();
  const ofd = new FormData();
  ofd.set('full_name', 'Auto Two User');
  ofd.set('username', 'auto2_user');
  ofd.set('password', 'pass1234');
  ofd.set('referral_code', 'REF-AUTO2');
  const ores = await call(env, 'POST', '/register', { form: ofd });
  const ohtml = await ores.text();
  ok(ores.status === 200 && ohtml.includes('account limit full'), 'owner-only panel blocks referrals until limit raised (1/1)');
  await setLimit('AUTO2', 2);
  const ores2 = await call(env, 'POST', '/register', { form: ofd });
  ok(ores2.status === 302, 'referral allowed after admin raises limit (2)');
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
  // AES-256-CBC moved to WebCrypto: wire format must stay byte-identical
  const { aes256CbcEncrypt, aes256CbcDecryptToString } = await import('../src/crypto.js');
  const { createCipheriv } = await import('node:crypto');
  const pt = '{"status":true,"data":{"real":"PUBG-K-S-Hunter2"}}';
  const K = 'a'.repeat(64), IV = 'b'.repeat(32);
  const nodeCt = (() => { const c = createCipheriv('aes-256-cbc', Buffer.from(K, 'hex'), Buffer.from(IV, 'hex')); return Buffer.concat([c.update(pt, 'utf8'), c.final()]).toString('base64'); })();
  const subtleCt = await aes256CbcEncrypt(pt, K, IV);
  ok(nodeCt === subtleCt, 'subtle ciphertext identical to node:crypto (protocol unchanged)');
  ok(await aes256CbcDecryptToString(subtleCt, K, IV) === pt, 'subtle decrypt roundtrip');
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

// ---------- 7f. DEBUG_ERRORS flag: 500s hide internals unless opted in ----------
console.log('debug errors flag');
{
  const badDb = {
    prepare() { throw new Error('boom-secret-marker'); },
    exec: async () => {},
  };
  const mkfd = () => { const f = new FormData(); f.set('game', 'PUBG'); f.set('user_key', 'K'); f.set('serial', 'S'); return f; };
  const r1 = await app.fetch(new Request('https://panel.test/connect/YUVI_001', { method: 'POST', body: mkfd() }), { DB: badDb, PANEL_CODE: 'YUVI_001', PANEL_NAME: 'T' }, {});
  const t1 = await r1.text();
  ok(r1.status === 500 && !t1.includes('boom-secret-marker'), '500 hides internals by default');
  const r2 = await app.fetch(new Request('https://panel.test/connect/YUVI_001', { method: 'POST', body: mkfd() }), { DB: badDb, PANEL_CODE: 'YUVI_001', PANEL_NAME: 'T', DEBUG_ERRORS: '1' }, {});
  const t2 = await r2.text();
  ok(r2.status === 500 && t2.includes('boom-secret-marker'), 'DEBUG_ERRORS=1 reveals cause to operator');
  globalThis.__arcDbReady = '';
}

// ---------- 7g. extending a pending key must not corrupt duration ----------
console.log('pending extend');
{
  const g = await call(env, 'POST', '/api/generate', { cookie: ownerCookie, json: { duration: '7D', device_limit: 1, bulk_amount: 1 } });
  const kv = (await g.json()).keys[0];
  const row = await env.DB.prepare('SELECT id,duration,expires_at FROM api_keys WHERE key_value=?').bind(kv).first();
  ok(row && !row.expires_at, 'new key is pending (no expiry yet)');
  const e = await call(env, 'POST', '/api/keys', { cookie: ownerCookie, json: { action: 'edit_key', key_id: row.id, edit_status: '1', extend_val: 5, extend_unit: 'D' } });
  ok((await e.json()).ok === true, 'extend pending key via API');
  const after = await env.DB.prepare('SELECT duration,expires_at FROM api_keys WHERE id=?').bind(row.id).first();
  ok(after.duration === '7D', 'duration untouched (was mangled to 7D+5D before fix)');
  ok(after.expires_at && Date.parse(after.expires_at.replace(' ', 'T') + 'Z') > Date.now() + 11 * 864e5, 'real expiry set ~12 days out');
  const fd = new FormData();
  fd.set('game', 'PUBG');
  fd.set('user_key', kv);
  fd.set('serial', 'DEV-EXT');
  const c = await call(env, 'POST', '/connect/YUVI_001', { form: fd });
  ok(c.status === 200 && (await c.json()).status === true, 'extended pending key works on first use');
}

// ---------- 7h. AES rotation takes effect immediately, every time ----------
// Proves /encrypt always uses the CURRENT keys (fresh D1 read per request,
// zero caching): rotate 3x, each payload must decrypt ONLY with its own keys.
console.log('aes rotation');
{
  const { createDecipheriv } = await import('node:crypto');
  const dec = (payload, keyHex, ivHex) => {
    const d = createDecipheriv('aes-256-cbc', Buffer.from(keyHex, 'hex'), Buffer.from(ivHex, 'hex'));
    return Buffer.concat([d.update(payload, 'base64'), d.final()]).toString('utf8');
  };
  const setAES = async (k, v) => {
    await env.DB.prepare("INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES (?,?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value").bind('aes_key', k, 'YUVI_001').run();
    await env.DB.prepare("INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES (?,?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value").bind('aes_iv', v, 'YUVI_001').run();
  };
  const krow = await env.DB.prepare('SELECT key_value FROM api_keys WHERE panel_code=? LIMIT 1').bind('YUVI_001').first();
  const encCall = async () => {
    const f = new FormData();
    f.set('game', 'PUBG');
    f.set('user_key', krow.key_value);
    f.set('serial', 'DEV-001'); // already bound in §6: reuse avoids device-limit noise
    const r = await call(env, 'POST', '/encrypt/YUVI_001', { form: f });
    return { status: r.status, body: await r.json() };
  };
  const K = ['1'.repeat(64), '3'.repeat(64), '5'.repeat(64)];
  const V = ['2'.repeat(32), '4'.repeat(32), '6'.repeat(32)];
  const payloads = [];
  for (let i = 0; i < 3; i++) {
    await setAES(K[i], V[i]); // rotate (1st set + 2 rotations)
    const r = await encCall();
    ok(r.status === 200 && typeof r.body.payload === 'string', 'encrypt ok with AES set #' + (i + 1));
    payloads.push(r.body.payload);
    ok(JSON.parse(dec(r.body.payload, K[i], V[i])).status === true, 'payload #' + (i + 1) + ' decrypts with current keys');
  }
  ok(new Set(payloads).size === 3, 'every rotation changes the ciphertext');
  let staleOk = true;
  try { JSON.parse(dec(payloads[2], K[0], V[0])); } catch { staleOk = false; }
  ok(!staleOk, 'latest payload NOT readable with rotated-out keys');
}

// ---------- 7i. tester decrypt preview (real path, server-side only) ----------
console.log('test-decrypt preview');
{
  const krow = await env.DB.prepare('SELECT key_value,uses,expires_at FROM api_keys WHERE panel_code=? LIMIT 1').bind('YUVI_001').first();
  const pv = async (body, cookie) => {
    const r = await call(env, 'POST', '/api/test-decrypt', { cookie, json: body });
    return { status: r.status, body: await r.json() };
  };
  const good = await pv({ user_key: krow.key_value, serial: 'DEV-001', endpoint: 'encrypt' }, ownerCookie);
  ok(good.status === 200 && good.body.ok === true && good.body.http === 200, 'preview endpoint ok');
  ok(typeof good.body.raw.payload === 'string', 'preview shows raw encrypted payload');
  ok(good.body.decrypted && good.body.decrypted.status === true && String(good.body.decrypted.data.real || '').includes(krow.key_value), 'preview decrypts with fresh D1 keys');
  ok(!JSON.stringify(good.body).match(/5{64}|6{32}/), 'no AES key/iv material leaks into preview');
  const conn = await pv({ user_key: krow.key_value, serial: 'DEV-001', endpoint: 'connect' }, ownerCookie);
  ok(conn.body.ok === true && conn.body.raw.status === true && conn.body.decrypted === null, 'connect preview passes raw through');
  const badKey = await pv({ user_key: 'NOPE', serial: 'X', endpoint: 'encrypt' }, ownerCookie);
  ok(badKey.body.ok === true && badKey.body.http === 403, 'backend errors pass through with status');
  const missing = await pv({ user_key: '', serial: '' }, ownerCookie);
  ok(missing.status === 400, 'missing fields rejected');
  const anon = await pv({ user_key: krow.key_value, serial: 'DEV-001' });
  ok(anon.status === 401, 'preview requires login');
  // rotate must not touch user keys: same row keeps working, uses just count up
  const before = await env.DB.prepare('SELECT uses,expires_at FROM api_keys WHERE key_value=?').bind(krow.key_value).first();
  await pv({ user_key: krow.key_value, serial: 'DEV-001', endpoint: 'encrypt' }, ownerCookie);
  await pv({ user_key: krow.key_value, serial: 'DEV-001', endpoint: 'encrypt' }, ownerCookie);
  const after = await env.DB.prepare('SELECT uses,expires_at FROM api_keys WHERE key_value=?').bind(krow.key_value).first();
  ok(after.uses === before.uses + 2 && after.expires_at === before.expires_at, 'rotations/tests never mutate user keys (uses +2, expiry same)');
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
