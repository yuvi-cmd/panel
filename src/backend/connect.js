import { aes256CbcEncrypt } from './crypto.js';
import { md5hex } from './crypto.js';

// Client downloads `lib_url` verbatim. Reject malformed hosts such as
// "https://storage/..." here so a successful login never turns into
// "Unable to resolve host \"storage\"" on the device.
export function libUrlOk(value, { allowEmpty = true } = {}) {
  const s = String(value == null ? '' : value).trim();
  if (s === '') return allowEmpty;
  if (s.length > 500 || /\s/.test(s)) return false;
  let u;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname;
  if (!host || host.length > 253) return false;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  const labels = host.split('.');
  if (labels.length < 2) return false;
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

export function safeLibUrl(value) {
  const s = String(value == null ? '' : value).trim();
  return libUrlOk(s, { allowEmpty: false }) ? s : '';
}

// One-time per panel: seed 4 starter versions with EMPTY tags/URLs
export async function ensureModVersions(db, panel) {
  try {
    const marker = await db.prepare("SELECT setting_value FROM mod_settings WHERE panel_code=? AND setting_name='modvers_seeded'").bind(panel).first().catch(() => null);
    if (marker) return;
    const n = await db.prepare('SELECT COUNT(*) n FROM mod_versions WHERE panel_code=?').bind(panel).first().catch(() => null);
    if (!n || (n.n | 0) === 0) {
      const r = await db.prepare('SELECT server_type,file_path FROM loader_files WHERE panel_code=?').bind(panel).all().catch(() => ({ results: [] }));
      const libs = {};
      for (const row of r.results || []) libs[String(row.server_type || '').toUpperCase()] = String(row.file_path || '');
      const seed = ['PRIVATE', 'PUBLIC', 'ADMIN', 'SAFE'];
      for (let i = 0; i < seed.length; i++) {
        const nm = seed[i];
        const u = safeLibUrl(libs[nm] || '');
        await db.prepare('INSERT INTO mod_versions (panel_code,name,tag,url,sort) VALUES (?,?,?,?,?)').bind(panel, nm, '', u, i).run().catch(() => {});
      }
    }
    await db.prepare("INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES ('modvers_seeded','1',?) ON CONFLICT(setting_name,panel_code) DO NOTHING").bind(panel).run().catch(() => {});
  } catch {}
}

const md5 = s => md5hex(s);
const clean = (v, max = 255) => (typeof v === 'string' && v.trim() !== '' && v.trim().length <= max) ? v.trim() : '';

// FIX (info-leak): never echo DB exception text to clients. Log server-side.
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
export function arcxSaltFromEnv(env) {
  const v = env && typeof env.ARCX_TOKEN_SALT === 'string' ? env.ARCX_TOKEN_SALT : '';
  return v || 'Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E';
}

export function aes256CbcEnc(json, keyHex, ivHex) {
  return aes256CbcEncrypt(json, keyHex, ivHex);
}

// ============================================================
// APK-compatible double AES-256-CBC (matches native main.cpp)
// Keys come from panel DB settings (aes_key_l1, aes_key_l2) —
// generate from /aes page, copy to C++ APK, rebuild.
// Fallback defaults below match the C++ strings in main.cpp.
// ============================================================
const DEFAULT_AES_KEY_L1 = 'ARCX2026LAYERONEKEY32BYTESKEY001';
const DEFAULT_AES_KEY_L2 = 'ARCX2026LAYERTWOKEY32BYTESKEY002';

async function deriveAesKey(keyStr) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyStr));
  return new Uint8Array(buf);
}

function b64ToBytes(b64) {
  const bin = atob(String(b64 || '').trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Read both AES key strings from panel DB settings.
async function getAesKeyStrings(db, panel) {
  const s = await loadSettings(db, panel);
  return {
    l1: String(s.aes_key_l1 || DEFAULT_AES_KEY_L1).trim(),
    l2: String(s.aes_key_l2 || DEFAULT_AES_KEY_L2).trim(),
  };
}

// Decrypt: base64 -> AES-CBC L2 -> AES-CBC L1 -> plaintext string
async function apkDoubleDecrypt(db, panel, b64Data) {
  const raw = b64ToBytes(b64Data);
  if (raw.length < 32) return '';

  const { l1, l2 } = await getAesKeyStrings(db, panel);
  const keyL2 = await deriveAesKey(l2);
  const keyL1 = await deriveAesKey(l1);

  const iv2 = raw.subarray(0, 16);
  const ct2 = raw.subarray(16);
  const k2 = await crypto.subtle.importKey('raw', keyL2, { name: 'AES-CBC' }, false, ['decrypt']);
  const pt2 = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv2 }, k2, ct2);

  const d2 = new Uint8Array(pt2);
  const iv1 = d2.subarray(0, 16);
  const ct1 = d2.subarray(16);
  const k1 = await crypto.subtle.importKey('raw', keyL1, { name: 'AES-CBC' }, false, ['decrypt']);
  const pt1 = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv1 }, k1, ct1);

  return new TextDecoder().decode(pt1);
}

// Encrypt: plaintext -> AES-CBC L1 -> AES-CBC L2 -> base64
async function apkDoubleEncrypt(db, panel, plaintext) {
  const { l1, l2 } = await getAesKeyStrings(db, panel);
  const keyL1 = await deriveAesKey(l1);
  const keyL2 = await deriveAesKey(l2);
  const enc = new TextEncoder().encode(plaintext);

  const iv1 = crypto.getRandomValues(new Uint8Array(16));
  const k1 = await crypto.subtle.importKey('raw', keyL1, { name: 'AES-CBC' }, false, ['encrypt']);
  const ct1 = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: iv1 }, k1, enc);

  const d1 = new Uint8Array(iv1.length + ct1.byteLength);
  d1.set(iv1, 0);
  d1.set(new Uint8Array(ct1), iv1.length);

  const iv2 = crypto.getRandomValues(new Uint8Array(16));
  const k2 = await crypto.subtle.importKey('raw', keyL2, { name: 'AES-CBC' }, false, ['encrypt']);
  const ct2 = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: iv2 }, k2, d1);

  const d2 = new Uint8Array(iv2.length + ct2.byteLength);
  d2.set(iv2, 0);
  d2.set(new Uint8Array(ct2), iv2.length);

  return bytesToB64(d2);
}

// Parse "H1=...&H2=...&H3=...&user_key=...&hwid=..." into an object
function parsePostBody(text) {
  const out = {};
  for (const part of String(text || '').split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
  }
  return out;
}

// Simple djb2 hash (matches C++ simpleHash in native main.cpp)
function simpleHash(s) {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash;
}

async function loadSettings(db, panel) {
  const r = await db.prepare('SELECT setting_name,setting_value FROM mod_settings WHERE panel_code=?').bind(panel).all().catch(() => ({ results: [] }));
  const m = {};
  for (const row of r.results || []) m[row.setting_name] = row.setting_value;
  return m;
}

async function versionFor(db, panel, st) {
  const pick = (sql, binds) => db.prepare(sql).bind(...binds).first().catch(() => null);
  let r = await pick('SELECT id,name,tag,url FROM mod_versions WHERE panel_code=? AND UPPER(name)=? LIMIT 1', [panel, st]);
  if (!r) r = await pick("SELECT id,name,tag,url FROM mod_versions WHERE panel_code=? AND UPPER(name)='PRIVATE' LIMIT 1", [panel]);
  if (!r) r = await pick('SELECT id,name,tag,url FROM mod_versions WHERE panel_code=? ORDER BY sort ASC, id ASC LIMIT 1', [panel]);
  return r || null;
}

async function libUrlFor(db, panel, st, ver) {
  const stored = String(ver && ver.url ? ver.url : '').trim();
  const direct = safeLibUrl(stored);
  if (direct || stored === '') return direct;
  const r = await db.prepare('SELECT server_type,file_path FROM loader_files WHERE panel_code=?').bind(panel).all().catch(() => ({ results: [] }));
  const rows = r.results || [];
  const pick = rows.find((row) => String(row.server_type || '').toUpperCase() === st)
    || rows.find((row) => String(row.server_type || '').toUpperCase() === 'PRIVATE')
    || rows.find((row) => safeLibUrl(row.file_path));
  return pick ? safeLibUrl(pick.file_path) : '';
}

async function verifyKey(db, panel, userKey, serial) {
  const key = await db.prepare('SELECT * FROM api_keys WHERE key_value=? AND panel_code=? AND is_active=1 LIMIT 1').bind(userKey, panel).first().catch(() => null);
  if (!key) return { err: 'USER OR GAME NOT REGISTERED', code: 403 };
  if ((key.is_blocked | 0) === 1) return { err: 'USER BLOCKED', code: 403 };
  if (key.expires_at && Date.parse(String(key.expires_at).replace(' ', 'T') + 'Z') < Date.now()) return { err: 'EXPIRED KEY', code: 403 };
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
    const lib = await libUrlFor(db, panel, st, ver);
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

  let userKey, hwid, isFormData = false;

  // Try FormData first (for API tester / browser clients)
  try {
    const fd = await request.formData();
    const game = clean(fd.get('game'), 50);
    userKey = clean(fd.get('user_key'), 50);
    hwid = clean(fd.get('serial'), 100);
    if (game && userKey && hwid && game === 'PUBG') {
      isFormData = true;
    }
  } catch {}

  if (isFormData) {
    // Plain form data — verify hashes directly, no decryption needed
    const ukHash = simpleHash(userKey);
    const hwHash = simpleHash(hwid);
    const calcH1 = 2 * ukHash + 10 * hwHash;
    const calcH2 = hwHash * hwHash + 12 * calcH1;
    const calcH3 = 25 * (calcH1 + calcH2);
    const H1 = String(calcH1 >>> 0);
    const H2 = String(calcH2 >>> 0);
    const H3 = String(calcH3 >>> 0);

    // Validate panel active
    try {
      const prow = await db.prepare('SELECT is_active,expires_at FROM panels WHERE panel_code=?').bind(panel).first().catch(() => null);
      if (!prow || (prow.is_active | 0) !== 1) return J({ status: false, reason: 'USER OR GAME NOT REGISTERED' }, 403);

      const notPast = (s) => { const ms = Date.parse(String(s || '').replace(' ', 'T') + 'Z'); return !isNaN(ms) && ms > Date.now(); };
      const owner = await db.prepare("SELECT panel_expiry FROM users WHERE panel_code=? AND role IN ('OWNER','PROFESSOR') ORDER BY id ASC LIMIT 1").bind(panel).first().catch(() => null);
      if (!notPast(owner?.panel_expiry) && !notPast(prow.expires_at)) return J({ status: false, reason: 'PANEL NOT ACTIVATED' }, 403);

      const mnt = await db.prepare('SELECT is_active,reason FROM mod_maintenance WHERE panel_code=?').bind(panel).first().catch(() => null);
      if (mnt && (mnt.is_active | 0) === 1) return J({ status: false, reason: clean(mnt.reason, 255) || 'SERVER UNDER MAINTENANCE' }, 503);

      const v = await verifyKey(db, panel, userKey, hwid);
      if (v.err) return J({ status: false, reason: v.err }, v.code);

      // Build encrypted response
      const R1 = userKey + '+' + hwid + '=true';
      const D = 1;
      const inner = {
        status: true,
        R1: R1,
        D: D,
        EXP: v.expiry,
        rng: Math.floor(Date.now() / 1000),
        device: String(v.key.device_limit | 0),
      };
      const encryptedResponse = await apkDoubleEncrypt(db, panel, JSON.stringify(inner));
      return new Response(encryptedResponse, {
        status: 200,
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', ...cors },
      });
    } catch (e) { return J({ status: false, reason: 'SERVER ERROR' + await errDetail(db, request, e, env) }, 500); }
  }

  // APK flow: read raw encrypted body
  let bodyText;
  try { bodyText = await request.text(); } catch { return J({ status: false, reason: 'INVALID PARAMETER' }, 400); }
  const encryptedPayload = bodyText.trim();
  if (!encryptedPayload) return J({ status: false, reason: 'EMPTY PAYLOAD' }, 400);

  // Double-decrypt: base64 -> AES-CBC L2 -> AES-CBC L1 -> plaintext
  let decrypted;
  try { decrypted = await apkDoubleDecrypt(db, panel, encryptedPayload); } catch { return J({ status: false, reason: 'DECRYPTION FAILED' }, 403); }
  if (!decrypted) return J({ status: false, reason: 'DECRYPTION FAILED' }, 403);

  const params = parsePostBody(decrypted);
  const H1 = params.H1, H2 = params.H2, H3 = params.H3;
  userKey = params.user_key;
  hwid = params.hwid;

  if (!H1 || !H2 || !H3 || !userKey || !hwid) {
    return J({ status: false, reason: 'MISSING PARAMETERS' }, 400);
  }

  // Verify H1 = 2*hash(user_key) + 10*hash(hwid)
  const ukHash = simpleHash(userKey);
  const hwHash = simpleHash(hwid);
  const calcH1 = 2 * ukHash + 10 * hwHash;
  const calcH2 = hwHash * hwHash + 12 * calcH1;
  const calcH3 = 25 * (calcH1 + calcH2);

  if (String(H1) !== String(calcH1 >>> 0) || String(H2) !== String(calcH2 >>> 0) || String(H3) !== String(calcH3 >>> 0)) {
    return J({ status: false, reason: 'HASH MISMATCH' }, 403);
  }

  // Validate panel active
  try {
    const prow = await db.prepare('SELECT is_active,expires_at FROM panels WHERE panel_code=?').bind(panel).first().catch(() => null);
    if (!prow || (prow.is_active | 0) !== 1) return J({ status: false, reason: 'USER OR GAME NOT REGISTERED' }, 403);

    const notPast = (s) => { const ms = Date.parse(String(s || '').replace(' ', 'T') + 'Z'); return !isNaN(ms) && ms > Date.now(); };
    const owner = await db.prepare("SELECT panel_expiry FROM users WHERE panel_code=? AND role IN ('OWNER','PROFESSOR') ORDER BY id ASC LIMIT 1").bind(panel).first().catch(() => null);
    if (!notPast(owner?.panel_expiry) && !notPast(prow.expires_at)) return J({ status: false, reason: 'PANEL NOT ACTIVATED' }, 403);

    const mnt = await db.prepare('SELECT is_active,reason FROM mod_maintenance WHERE panel_code=?').bind(panel).first().catch(() => null);
    if (mnt && (mnt.is_active | 0) === 1) return J({ status: false, reason: clean(mnt.reason, 255) || 'SERVER UNDER MAINTENANCE' }, 503);

    const v = await verifyKey(db, panel, userKey, hwid);
    if (v.err) return J({ status: false, reason: v.err }, v.code);

    // Build encrypted response: R1 = user_key+hwid=true, D = 1 (device limit)
    const R1 = userKey + '+' + hwid + '=true';
    const D = 1;

    const inner = {
      status: true,
      R1: R1,
      D: D,
      EXP: v.expiry,
      rng: Math.floor(Date.now() / 1000),
      device: String(v.key.device_limit | 0),
    };

    const encryptedResponse = await apkDoubleEncrypt(db, panel, JSON.stringify(inner));
    return new Response(encryptedResponse, {
      status: 200,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', ...cors },
    });
  } catch (e) { return J({ status: false, reason: 'SERVER ERROR' + await errDetail(db, request, e, env) }, 500); }
}