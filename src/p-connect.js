import { aes256CbcEncrypt } from './crypto.js';
import { md5hex } from './crypto.js';

// Legacy starter lib URLs — used ONLY to seed editable "versions" rows the
// first time a panel is touched. After that, Set Mod/Loader (mod_versions)
// is the single source of truth: connect never hardcodes a URL.
const LEGACY_LIBS = {
  PRIVATE: 'https://github.com/yuvicodes-lab/ONLINE-MOD/raw/refs/heads/main/libbgmi.zip',
  PUBLIC: 'https://github.com/yuvicodes-lab/ONLINE-MOD/raw/refs/heads/main/lib_public.zip',
  ADMIN: 'https://github.com/yuvicodes-lab/ONLINE-MOD/raw/refs/heads/main/lib_admin.zip',
  SAFE: 'https://github.com/yuvicodes-lab/ONLINE-MOD/raw/refs/heads/main/lib_safe.zip',
};

// One-time per panel: seed 4 starter versions (existing loader_files URLs
// win, else legacy links). A mod_settings marker stops re-seeding after the
// owner deletes versions on purpose.
export async function ensureModVersions(db, panel) {
  try {
    const marker = await db.prepare("SELECT setting_value FROM mod_settings WHERE panel_code=? AND setting_name='modvers_seeded'").bind(panel).first().catch(() => null);
    if (marker) return;
    const n = await db.prepare('SELECT COUNT(*) n FROM mod_versions WHERE panel_code=?').bind(panel).first().catch(() => null);
    if (!n || (n.n | 0) === 0) {
      const r = await db.prepare('SELECT server_type,file_path FROM loader_files WHERE panel_code=?').bind(panel).all().catch(() => ({ results: [] }));
      const libs = {};
      for (const row of r.results || []) libs[String(row.server_type || '').toUpperCase()] = String(row.file_path || '');
      const seed = [['PRIVATE', 'PAID'], ['PUBLIC', 'FREE'], ['ADMIN', 'PAID'], ['SAFE', 'FREE']];
      for (let i = 0; i < seed.length; i++) {
        const nm = seed[i][0], tg = seed[i][1];
        const u = /^https?:\/\//i.test(libs[nm] || '') ? libs[nm] : LEGACY_LIBS[nm];
        await db.prepare('INSERT INTO mod_versions (panel_code,name,tag,url,sort) VALUES (?,?,?,?,?)').bind(panel, nm, tg, u, i).run().catch(() => {});
      }
    }
    await db.prepare("INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES ('modvers_seeded','1',?) ON CONFLICT(setting_name,panel_code) DO NOTHING").bind(panel).run().catch(() => {});
  } catch {}
}

const md5 = s => md5hex(s);
const clean = (v, max = 255) => (typeof v === 'string' && v.trim() !== '' && v.trim().length <= max) ? v.trim() : '';

// FIX (info-leak): never echo DB exception text to clients. Log server-side.
// Exception: explicit operator opt-in via DEBUG_ERRORS=1 (wrangler vars) to
// diagnose a live 500. MUST stay off in production.
async function errDetail(db, request, e, env) {
  try { console.error('connect/encrypt error:', (e && e.stack) || e); } catch {}
  try {
    if (env && env.DEBUG_ERRORS === '1') {
      const m = String((e && e.message) || e).slice(0, 200);
      if (m) return ' [debug] ' + m;
    }
  } catch {}
  return '';
}

// Token salt: legacy-compat fallback. Override via `ARCX_TOKEN_SALT` secret.
// WARNING: rotating this invalidates all previously issued client tokens.
export function arcxSaltFromEnv(env) {
  const v = env && typeof env.ARCX_TOKEN_SALT === 'string' ? env.ARCX_TOKEN_SALT : '';
  return v || 'Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E';
}

export function aes256CbcEnc(json, keyHex, ivHex) {
  return aes256CbcEncrypt(json, keyHex, ivHex);
}

async function loadSettings(db, panel) {
  const r = await db.prepare('SELECT setting_name,setting_value FROM mod_settings WHERE panel_code=?').bind(panel).all().catch(() => ({ results: [] }));
  const m = {};
  for (const row of r.results || []) m[row.setting_name] = row.setting_value;
  return m;
}

// Pick the panel's version row for a key's server type: exact name match,
// then PRIVATE, then the first version by sort order.
async function versionFor(db, panel, st) {
  const pick = (sql, binds) => db.prepare(sql).bind(...binds).first().catch(() => null);
  let r = await pick('SELECT id,name,tag,url FROM mod_versions WHERE panel_code=? AND UPPER(name)=? LIMIT 1', [panel, st]);
  if (!r) r = await pick("SELECT id,name,tag,url FROM mod_versions WHERE panel_code=? AND UPPER(name)='PRIVATE' LIMIT 1", [panel]);
  if (!r) r = await pick('SELECT id,name,tag,url FROM mod_versions WHERE panel_code=? ORDER BY sort ASC, id ASC LIMIT 1', [panel]);
  return r || null;
}

async function verifyKey(db, panel, userKey, serial) {
  const key = await db.prepare('SELECT * FROM api_keys WHERE key_value=? AND panel_code=? AND is_active=1 LIMIT 1').bind(userKey, panel).first().catch(() => null);
  if (!key) return { err: 'USER OR GAME NOT REGISTERED', code: 403 };
  if ((key.is_blocked | 0) === 1) return { err: 'USER BLOCKED', code: 403 };
  if (key.expires_at && Date.parse(String(key.expires_at).replace(' ', 'T') + 'Z') < Date.now()) return { err: 'EXPIRED KEY', code: 403 };
  // device gate
  const devs = (await db.prepare('SELECT device_uuid FROM key_devices WHERE key_id=?').bind(key.id).all().catch(() => ({ results: [] }))).results.map(d => d.device_uuid);
  if (!devs.includes(serial)) {
    if (devs.length >= Math.max(0, key.device_limit | 0)) return { err: 'MAX DEVICE REACHED', code: 403 };
    await db.prepare('INSERT INTO key_devices (key_id,device_uuid,panel_code) VALUES (?,?,?)').bind(key.id, serial, panel).run();
  } else {
    await db.prepare("UPDATE key_devices SET last_seen=datetime('now') WHERE key_id=? AND device_uuid=?").bind(key.id, serial).run();
  }
  let expiry = key.expires_at;
  if (!expiry) {
    const dur = String(key.duration || '').toUpperCase().trim();
    const m = dur.match(/^(\d+)([DH])$/);
    if (!m) return { err: 'INVALID KEY DURATION', code: 500 };
    const ms = m[2] === 'D' ? (+m[1]) * 864e5 : (+m[1]) * 36e5;
    expiry = new Date(Date.now() + ms).toISOString().slice(0, 19).replace('T', ' ');
    await db.prepare('UPDATE api_keys SET expires_at=?,uses=uses+1 WHERE id=?').bind(expiry, key.id).run();
  } else {
    await db.prepare('UPDATE api_keys SET uses=uses+1 WHERE id=?').bind(key.id).run();
  }
  return { key, expiry };
}

export async function handleConnect(request, db, panel, env) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const J = (obj, code = 200) => new Response(JSON.stringify(obj), { status: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
  if (request.method.toUpperCase() !== 'POST') return J({ status: false, reason: 'METHOD NOT ALLOWED' }, 405);
  panel = clean(panel, 20);
  if (!panel) return J({ status: false, reason: 'PANEL CODE MISSING' }, 400);
  let fd;
  try { fd = await request.formData(); } catch { return J({ status: false, reason: 'INVALID PARAMETER' }, 400); }
  const game = clean(fd.get('game'), 50), userKey = clean(fd.get('user_key'), 50), serial = clean(fd.get('serial'), 100);
  if (!game || !userKey || !serial || game !== 'PUBG') return J({ status: false, reason: game !== 'PUBG' && game ? 'USER OR GAME NOT REGISTERED' : 'INVALID PARAMETER' }, game && game !== 'PUBG' ? 403 : 400);
  try {
    const prow = await db.prepare('SELECT is_active FROM panels WHERE panel_code=?').bind(panel).first().catch(() => null);
    if (!prow || (prow.is_active | 0) !== 1) return J({ status: false, reason: 'USER OR GAME NOT REGISTERED' }, 403);
    const mnt = await db.prepare('SELECT is_active,reason FROM mod_maintenance WHERE panel_code=?').bind(panel).first().catch(() => null);
    if (mnt && (mnt.is_active | 0) === 1) return J({ status: false, reason: clean(mnt.reason, 255) || 'SERVER UNDER MAINTENANCE' }, 503);
    const v = await verifyKey(db, panel, userKey, serial);
    if (v.err) return J({ status: false, reason: v.err }, v.code);
    const s = await loadSettings(db, panel);
    const get = (k, d) => (k in s && s[k] != null ? String(s[k]) : d);
    const real = 'PUBG-' + userKey + '-' + serial + '-' + arcxSaltFromEnv(env);
    const token = md5(real), enc = md5(token + 'VIPENC');
    const st = (String(v.key.server_type || 'PRIVATE').toUpperCase().replace(/[^A-Z0-9 _.-]/g, '').slice(0, 30)) || 'PRIVATE';
    let ver = await versionFor(db, panel, st);
    if (!ver) { await ensureModVersions(db, panel); ver = await versionFor(db, panel, st); }
    const lib = ver && ver.url ? String(ver.url) : '';
    const label = ver ? (String(ver.name) + (ver.tag ? ' ' + String(ver.tag) : '')).toUpperCase() : st;
    const plan = ver && ver.tag ? String(ver.tag).toUpperCase() : (st === 'PUBLIC' || st === 'SAFE' ? 'FREE' : 'PAID');
    return J({
      status: true, data: {
        real, token, Enc: enc, EXP: v.expiry, rng: Math.floor(Date.now() / 1000),
        server_type: st, key_mode: st, mode: st === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
        version: label, version_label: label, plan,
        lib_url: lib, lib, modname: get('modname', 'YUVI MOD'), mod_status: get('mod_status', 'Online'), credit: get('credit', 'Yuvi Panel'),
        ESP: get('ESP', 'on'), Item: get('Item', 'on'), AIM: get('AIM', 'on'), SilentAim: get('SilentAim', 'on'), BulletTrack: get('BulletTrack', 'on'),
        Floating: get('Floating', 'on'), Memory: get('Memory', 'on'), Setting: get('Setting', 'on'),
        exdate: v.expiry, device: String(v.key.device_limit | 0),
      }
    });
  } catch (e) { return J({ status: false, reason: 'SERVER ERROR' + await errDetail(db, request, e, env) }, 500); }
}

export async function handleEncrypt(request, db, panel, env) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const J = (obj, code = 200) => new Response(JSON.stringify(obj), { status: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
  if (request.method.toUpperCase() !== 'POST') return J({ status: false, reason: 'METHOD NOT ALLOWED' }, 405);
  panel = clean(panel, 20);
  if (!panel) return J({ status: false, reason: 'PANEL CODE MISSING' }, 400);
  let fd;
  try { fd = await request.formData(); } catch { return J({ status: false, reason: 'INVALID PARAMETER' }, 400); }
  const game = clean(fd.get('game'), 50), userKey = clean(fd.get('user_key'), 50), serial = clean(fd.get('serial'), 100);
  if (!game || !userKey || !serial || game !== 'PUBG') return J({ status: false, reason: 'INVALID PARAMETER' }, 400);
  try {
    const prow = await db.prepare('SELECT is_active,expires_at FROM panels WHERE panel_code=?').bind(panel).first().catch(() => null);
    if (!prow || (prow.is_active | 0) !== 1) return J({ status: false, reason: 'USER OR GAME NOT REGISTERED' }, 403);
    // Panel activation: voucher redeem sets users.panel_expiry, but panels
    // created with a duration already carry panels.expires_at (previously
    // written but never honoured — /encrypt stayed blocked). Either counts.
    const notPast = (s) => { const ms = Date.parse(String(s || '').replace(' ', 'T') + 'Z'); return !isNaN(ms) && ms > Date.now(); };
    const owner = await db.prepare("SELECT panel_expiry FROM users WHERE panel_code=? AND role IN ('OWNER','PROFESSOR') ORDER BY id ASC LIMIT 1").bind(panel).first().catch(() => null);
    if (!notPast(owner?.panel_expiry) && !notPast(prow.expires_at)) return J({ status: false, reason: 'PANEL NOT ACTIVATED' }, 403);
    const s = await loadSettings(db, panel);
    if (!s.aes_key || !s.aes_iv || !/^[0-9a-fA-F]{64}$/.test(s.aes_key) || !/^[0-9a-fA-F]{32}$/.test(s.aes_iv)) return J({ status: false, reason: 'ENCRYPTION NOT CONFIGURED' }, 500);
    const mnt = await db.prepare('SELECT is_active,reason FROM mod_maintenance WHERE panel_code=?').bind(panel).first().catch(() => null);
    if (mnt && (mnt.is_active | 0) === 1) return J({ status: false, reason: clean(mnt.reason, 255) || 'SERVER UNDER MAINTENANCE' }, 503);
    const v = await verifyKey(db, panel, userKey, serial);
    if (v.err) return J({ status: false, reason: v.err }, v.code);
    const get = (k, d) => (k in s && s[k] != null ? String(s[k]) : d);
    const real = 'PUBG-' + userKey + '-' + serial + '-' + arcxSaltFromEnv(env);
    const inner = {
      status: true, data: {
        real, token: md5(real), Enc: md5(md5(real) + 'VIPENC'), EXP: v.expiry, rng: Math.floor(Date.now() / 1000),
        server_type: String(v.key.server_type || 'PRIVATE').toUpperCase(), modname: get('modname', 'YUVI MOD'), mod_status: get('mod_status', 'Online'), credit: get('credit', 'Yuvi Panel'),
        ESP: get('ESP', 'on'), Item: get('Item', 'on'), AIM: get('AIM', 'on'), SilentAim: get('SilentAim', 'on'), BulletTrack: get('BulletTrack', 'on'),
        Floating: get('Floating', 'on'), Memory: get('Memory', 'on'), Setting: get('Setting', 'on'), exdate: v.expiry, device: String(v.key.device_limit | 0),
      }
    };
    return J({ status: true, payload: await aes256CbcEnc(JSON.stringify(inner), s.aes_key, s.aes_iv) });
  } catch (e) { return J({ status: false, reason: 'SERVER ERROR' + await errDetail(db, request, e, env) }, 500); }
}
