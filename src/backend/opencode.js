// OpenCode Android app backend: account login, device lock, activation,
// remote on/off and notices. Every app-facing request/response is wrapped in
// AES-256-GCM using OPENCODE_ENC_KEY (64 hex chars, Cloudflare secret).
//
// This module is intentionally isolated from the SDK/tenant tables. The
// admin surface is exposed only to panel user id 1 from router.js.

import { clientIp, hitRate, json, tsMs } from './security.js';

const AAD = new TextEncoder().encode('opencode:v1');
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const GMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i;
const DEVICE_RE = /^[A-Za-z0-9._:-]{8,160}$/;
// Public-by-design OpenCode transport passphrase (same idiom as the ARCX
// layer keys in connect.js). The Android APK embeds the SHA-256 of this
// string, so a fresh build works with zero server configuration. Setting a
// 64-hex value anywhere (env secret or the opencode_enc_key row) overrides
// it; a non-hex stored value is always SHA-256 derived.
const DEFAULT_OPENCODE_KEY = 'YUVISDK88702026BASE64';

const OPENCODE_SCHEMA = `
CREATE TABLE IF NOT EXISTS opencode_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT '',
  device_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT,
  last_login TEXT,
  last_seen TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_opencode_status ON opencode_users(status);
CREATE INDEX IF NOT EXISTS idx_opencode_seen ON opencode_users(last_seen);
CREATE TABLE IF NOT EXISTS opencode_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  device_id TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_opencode_sess_user ON opencode_sessions(user_id);
CREATE TABLE IF NOT EXISTS opencode_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS opencode_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS opencode_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  kind TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_opencode_events ON opencode_events(created_at);
`;

export async function ensureOpenCodeDB(db) {
  if (globalThis.__opencodeDbReady === true) return;
  // D1 exec() on some deployments rejects multi-statement DDL batches. Run
  // every statement separately so one index can never take the whole route
  // down with an uncaught Worker exception (HTTP 1101).
  const statements = OPENCODE_SCHEMA.split(';').map((sql) => sql.trim()).filter(Boolean);
  for (const sql of statements) {
    try {
      await db.prepare(sql).run();
    } catch (e) {
      if (/^CREATE\s+TABLE/i.test(sql)) throw e;
      console.error('opencode schema statement failed:', String(e?.message || e));
    }
  }
  try {
    await db.prepare("INSERT OR IGNORE INTO opencode_settings (key,value) VALUES ('global_enabled','1')").run();
    await db.prepare("INSERT OR IGNORE INTO opencode_settings (key,value) VALUES ('maintenance_message','')").run();
    await db.prepare("INSERT OR IGNORE INTO opencode_settings (key,value) VALUES ('support_url','')").run();
    await db.prepare("INSERT OR IGNORE INTO opencode_settings (key,value) VALUES ('min_version_code','1')").run();
    await db.prepare("INSERT OR IGNORE INTO opencode_settings (key,value) VALUES ('opencode_enc_key',?)").bind(DEFAULT_OPENCODE_KEY).run();
  } catch (e) {
    console.error('opencode settings seed failed:', String(e?.message || e));
  }
  // One-time migration: accounts that registered before approvals were dropped
  // are activated here, once per database. Marker-gated so an admin re-locking
  // an account later is not silently undone.
  try {
    const done = await db.prepare("SELECT value FROM opencode_settings WHERE key='pending_auto_activated'").first();
    if (done?.value !== '1') {
      await db.prepare("UPDATE opencode_users SET status='active' WHERE status='pending'").run();
      await db.prepare("INSERT OR REPLACE INTO opencode_settings (key,value) VALUES ('pending_auto_activated','1')").run();
      console.log('opencode: auto-activated pre-existing pending accounts (one-time)');
    }
  } catch (e) {
    console.error('opencode pending auto-activation failed:', String(e?.message || e));
  }
  globalThis.__opencodeDbReady = true;
}

// ---------------------------------------------------------------------------
// crypto helpers
// ---------------------------------------------------------------------------
function hexBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
function b64Bytes(value) {
  const s = String(value || '').replace(/\s+/g, '');
  if (!s || !B64_RE.test(s)) throw new Error('invalid base64');
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sha256Bytes(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return new Uint8Array(digest);
}
function encKey(env) {
  const raw = typeof env?.OPENCODE_ENC_KEY === 'string' ? env.OPENCODE_ENC_KEY.trim() : '';
  if (!/^[a-f0-9]{64}$/i.test(raw)) return null;
  return hexBytes(raw);
}
// Key resolution order (first wins):
//   1. env OPENCODE_ENC_KEY (64 hex) — Cloudflare Worker secret override
//   2. opencode_settings.opencode_enc_key (64 hex = raw key, anything else = SHA-256 passphrase)
//   3. auto-seeded default passphrase (DEFAULT_OPENCODE_KEY), SHA-256 derived
// The default is seeded by ensureOpenCodeDB(), so a fresh deploy works with
// zero manual Cloudflare configuration.
async function resolveEncKey(db, env) {
  const fromEnv = encKey(env);
  if (fromEnv) return { key: fromEnv, source: 'env' };
  let stored = '';
  try {
    const row = await db.prepare("SELECT value FROM opencode_settings WHERE key='opencode_enc_key'").first();
    stored = String(row?.value || '').trim();
  } catch {
    // opencode_settings may not exist yet on a cold database; fall back to the
    // default rather than failing every encrypted request.
    stored = '';
  }
  if (/^[a-f0-9]{64}$/i.test(stored)) return { key: hexBytes(stored), source: 'db' };
  if (stored) return { key: await sha256Bytes(stored), source: stored === DEFAULT_OPENCODE_KEY ? 'default' : 'db' };
  return { key: await sha256Bytes(DEFAULT_OPENCODE_KEY), source: 'default' };
}
export async function opencodeKeyStatus(db, env) {
  const resolved = await resolveEncKey(db, env);
  return { configured: true, source: resolved.source };
}
async function aesKey(db, env) {
  const { key } = await resolveEncKey(db, env);
  return crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function decryptEnvelope(body, db, env) {
  const key = await aesKey(db, env);
  if (!body || body.v !== 1) throw new Error('invalid_envelope');
  const nonce = b64Bytes(body.n);
  const data = b64Bytes(body.d);
  if (nonce.length !== 12 || data.length < 17) throw new Error('invalid_envelope');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: AAD }, key, data);
  return JSON.parse(new TextDecoder().decode(plain));
}
async function encryptEnvelope(obj, db, env) {
  const key = await aesKey(db, env);
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: AAD },
    key,
    new TextEncoder().encode(JSON.stringify(obj))
  );
  return { v: 1, n: bytesB64(nonce), d: bytesB64(new Uint8Array(data)) };
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomB64(len) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return bytesB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    base,
    256
  );
  return 'pbkdf2$100000$' + bytesB64(salt) + '$' + bytesB64(new Uint8Array(bits));
}
async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  if (!iterations || iterations < 1000) return false;
  const salt = b64Bytes(parts[2]);
  const expected = parts[3];
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    256
  );
  return bytesB64(new Uint8Array(bits)) === expected;
}

// ---------------------------------------------------------------------------
// validation / response helpers
// ---------------------------------------------------------------------------
function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && GMAIL_RE.test(email) ? email : '';
}
function cleanDevice(value) {
  const id = String(value || '').trim();
  return DEVICE_RE.test(id) ? id : '';
}
function cleanName(value, max = 80) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function sqlTime(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}
function isExpired(row, now = Date.now()) {
  return !!row.expires_at && tsMs(row.expires_at) > 0 && tsMs(row.expires_at) <= now;
}
function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name || '',
    status: row.status || 'pending',
    expires_at: row.expires_at || '',
    created_at: row.created_at || '',
  };
}
function userState(row, now = Date.now()) {
  if ((row.status || 'pending') === 'pending') return 'pending';
  if ((row.status || '') === 'disabled') return 'disabled';
  if (isExpired(row, now)) return 'expired';
  if ((row.status || '') !== 'active') return 'disabled';
  return 'active';
}
async function settingsMap(db) {
  const rows = (await db.prepare('SELECT key,value FROM opencode_settings').all().catch(() => ({ results: [] }))).results || [];
  const out = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}
async function latestNotice(db) {
  const row = await db.prepare('SELECT id,title,message,created_at FROM opencode_notices WHERE is_active=1 ORDER BY id DESC LIMIT 1').first().catch(() => null);
  return row ? { id: row.id, title: row.title || '', message: row.message || '', created_at: row.created_at || '' } : null;
}
async function statePayload(db, row, extra) {
  const settings = await settingsMap(db);
  const now = Date.now();
  const userStatus = userState(row, now);
  const globalEnabled = String(settings.global_enabled || '1') === '1';
  const reason = !globalEnabled ? 'maintenance' : userStatus;
  const active = reason === 'active';
  return {
    ok: true,
    active,
    reason,
    user: publicUser(row),
    global_enabled: globalEnabled,
    maintenance_message: globalEnabled ? '' : (settings.maintenance_message || ''),
    support_url: settings.support_url || '',
    min_version_code: parseInt(settings.min_version_code || '1', 10) || 1,
    notice: await latestNotice(db),
    server_time: now,
    ...(extra || {}),
  };
}
function clientError(error, code) {
  return { ok: false, error: String(error || 'Request failed'), code: String(code || 'error') };
}

// ---------------------------------------------------------------------------
// public app API
// ---------------------------------------------------------------------------
export async function handleOpenCodeApi(request, db, env) {
  const url = new URL(request.url);
  const action = url.pathname.split('/').filter(Boolean).pop() || '';
  const origin = request.headers.get('Origin') || '*';
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    await ensureOpenCodeDB(db);
  } catch (e) {
    console.error('opencode db bootstrap failed:', String(e?.message || e));
    return json({ ok: false, error: 'OpenCode database is not ready', code: 'db_error', detail: String(e?.message || e).slice(0, 300) }, 503, cors);
  }
  if (request.method !== 'POST') {
    return json(clientError('POST required', 'method'), 405, cors);
  }
  // The encryption key always resolves (env secret → DB row → auto-seeded
  // default passphrase), so there is no 503 "server_key_missing" path anymore.

  let payload;
  try {
    const body = await request.json();
    payload = await decryptEnvelope(body, db, env);
  } catch (e) {
    return json(clientError('Invalid encrypted request', 'bad_envelope'), 400, cors);
  }

  const ts = Number(payload?.ts || 0);
  if (!ts || Math.abs(Date.now() - ts) > 24 * 60 * 60 * 1000) {
    return json(await encryptEnvelope(clientError('Request timestamp is invalid', 'bad_timestamp'), db, env), 200, cors);
  }

  const ip = clientIp(request);
  const limiter = action === 'login'
    ? hitRate('oc-login:' + ip, 12, 60e3)
    : action === 'register'
      ? hitRate('oc-register:' + ip, 6, 10 * 60e3)
      : hitRate('oc-status:' + ip, 180, 60e3);
  if (!limiter.allowed) {
    return json(await encryptEnvelope(clientError('Too many requests. Try again shortly.', 'rate_limited'), db, env), 200, cors);
  }

  const deviceId = cleanDevice(payload.device_id);
  const deviceName = cleanName(payload.device_name, 120);

  try {
    if (action === 'register') {
      const email = cleanEmail(payload.email);
      const password = String(payload.password || '');
      const displayName = cleanName(payload.display_name || email.split('@')[0], 60);
      if (!email) throw new Error('Only @gmail.com email addresses are allowed');
      if (password.length < 8 || password.length > 128) throw new Error('Password must be 8-128 characters');
      if (!deviceId) throw new Error('Device identifier is missing');
      if (await db.prepare('SELECT id FROM opencode_users WHERE email=?').bind(email).first().catch(() => null)) {
        return json(await encryptEnvelope(clientError('An account with this email already exists', 'email_exists'), db, env), 200, cors);
      }
      const hash = await hashPassword(password);
      // New accounts are active immediately — no admin approval gate. The
      // admin can still disable/reset any account from the /opencode panel.
      const ins = await db.prepare(
        'INSERT INTO opencode_users (email,password_hash,display_name,device_id,device_name,status) VALUES (?,?,?,?,?,?)'
      ).bind(email, hash, displayName, deviceId, deviceName, 'active').run();
      const row = await db.prepare('SELECT * FROM opencode_users WHERE id=?').bind(ins.meta.last_row_id).first();
      const token = 'oc_' + randomB64(32);
      await db.prepare('INSERT INTO opencode_sessions (token_hash,user_id,device_id,expires_at) VALUES (?,?,?,?)')
        .bind(await sha256Hex(token), row.id, deviceId, Date.now() + SESSION_MS).run();
      await db.prepare("INSERT INTO opencode_events (user_id,kind,detail) VALUES (?,?,?)").bind(row.id, 'register', ip).run().catch(() => {});
      const state = await statePayload(db, row, { token });
      return json(await encryptEnvelope(state, db, env), 200, cors);
    }

    if (action === 'login') {
      const email = cleanEmail(payload.email);
      const password = String(payload.password || '');
      if (!email || !password) throw new Error('Email and password are required');
      const loginLimit = hitRate('oc-login-email:' + email, 10, 10 * 60e3);
      if (!loginLimit.allowed) {
        return json(await encryptEnvelope(clientError('Too many login attempts for this account', 'rate_limited'), db, env), 200, cors);
      }
      const row = await db.prepare('SELECT * FROM opencode_users WHERE email=?').bind(email).first().catch(() => null);
      if (!row || !(await verifyPassword(password, row.password_hash))) {
        return json(await encryptEnvelope(clientError('Invalid email or password', 'bad_credentials'), db, env), 200, cors);
      }
      if (!deviceId) throw new Error('Device identifier is missing');
      if (row.device_id && row.device_id !== deviceId) {
        return json(await encryptEnvelope(clientError('This account is locked to another device. Ask the admin to reset it.', 'device_mismatch'), db, env), 200, cors);
      }
      const now = Date.now();
      await db.prepare("UPDATE opencode_users SET device_id=?,device_name=?,last_login=datetime('now'),last_seen=datetime('now') WHERE id=?")
        .bind(deviceId, deviceName || row.device_name || '', row.id).run();
      await db.prepare('DELETE FROM opencode_sessions WHERE user_id=?').bind(row.id).run().catch(() => {});
      const token = 'oc_' + randomB64(32);
      await db.prepare('INSERT INTO opencode_sessions (token_hash,user_id,device_id,expires_at) VALUES (?,?,?,?)')
        .bind(await sha256Hex(token), row.id, deviceId, now + SESSION_MS).run();
      await db.prepare("INSERT INTO opencode_events (user_id,kind,detail) VALUES (?,?,?)").bind(row.id, 'login', ip).run().catch(() => {});
      const fresh = await db.prepare('SELECT * FROM opencode_users WHERE id=?').bind(row.id).first();
      return json(await encryptEnvelope(await statePayload(db, fresh, { token }), db, env), 200, cors);
    }

    if (action === 'logout') {
      const token = String(payload.token || '').trim();
      if (token) await db.prepare('DELETE FROM opencode_sessions WHERE token_hash=?').bind(await sha256Hex(token)).run().catch(() => {});
      return json(await encryptEnvelope({ ok: true }, db, env), 200, cors);
    }

    if (action === 'status' || action === 'ping') {
      const token = String(payload.token || '').trim();
      if (!token) return json(await encryptEnvelope(clientError('Login required', 'session_invalid'), db, env), 200, cors);
      const tokenHash = await sha256Hex(token);
      const session = await db.prepare('SELECT * FROM opencode_sessions WHERE token_hash=?').bind(tokenHash).first().catch(() => null);
      if (!session || Number(session.expires_at || 0) <= Date.now()) {
        if (session) await db.prepare('DELETE FROM opencode_sessions WHERE token_hash=?').bind(tokenHash).run().catch(() => {});
        return json(await encryptEnvelope(clientError('Session expired. Please login again.', 'session_invalid'), db, env), 200, cors);
      }
      const row = await db.prepare('SELECT * FROM opencode_users WHERE id=?').bind(session.user_id).first().catch(() => null);
      if (!row) return json(await encryptEnvelope(clientError('Account not found', 'session_invalid'), db, env), 200, cors);
      if (deviceId && (session.device_id !== deviceId || row.device_id !== deviceId)) {
        return json(await encryptEnvelope(clientError('This account is locked to another device', 'device_mismatch'), db, env), 200, cors);
      }
      await db.prepare("UPDATE opencode_users SET last_seen=datetime('now') WHERE id=?").bind(row.id).run().catch(() => {});
      await db.prepare("UPDATE opencode_users SET device_name=? WHERE id=? AND ?<>''").bind(deviceName, row.id, deviceName).run().catch(() => {});
      return json(await encryptEnvelope(await statePayload(db, row), db, env), 200, cors);
    }

    return json(await encryptEnvelope(clientError('Unknown action', 'not_found'), db, env), 200, cors);
  } catch (e) {
    const message = String(e?.message || 'Server error');
    const safe = message.includes('UNIQUE') ? 'Account already exists' : message;
    try {
      return json(await encryptEnvelope(clientError(safe, 'server_error'), db, env), 200, cors);
    } catch {
      return json(clientError('Server error', 'server_error'), 500, cors);
    }
  }
}

// ---------------------------------------------------------------------------
// admin data + actions (router must gate to panel user id === 1)
// ---------------------------------------------------------------------------
export async function getOpenCodeAdminData(db, query = '') {
  await ensureOpenCodeDB(db);
  const q = String(query || '').trim().toLowerCase().slice(0, 80);
  const settings = await settingsMap(db);
  const notices = (await db.prepare('SELECT * FROM opencode_notices ORDER BY id DESC LIMIT 30').all().catch(() => ({ results: [] }))).results || [];
  const users = q
    ? (await db.prepare('SELECT * FROM opencode_users WHERE lower(email) LIKE ? ORDER BY id DESC LIMIT 200').bind('%' + q + '%').all().catch(() => ({ results: [] }))).results || []
    : (await db.prepare('SELECT * FROM opencode_users ORDER BY id DESC LIMIT 200').all().catch(() => ({ results: [] }))).results || [];
  const count = async (sql, ...args) => {
    const row = await db.prepare(sql).bind(...args).first().catch(() => null);
    return Number(row?.c || 0);
  };
  const now = Date.now();
  for (const u of users) u.computed_status = userState(u, now);
  const active = await count("SELECT COUNT(*) c FROM opencode_users WHERE status='active' AND (expires_at IS NULL OR expires_at='' OR expires_at > datetime('now'))");
  const pending = await count("SELECT COUNT(*) c FROM opencode_users WHERE status='pending'");
  const disabled = await count("SELECT COUNT(*) c FROM opencode_users WHERE status='disabled'");
  const total = await count('SELECT COUNT(*) c FROM opencode_users');
  const online = await count("SELECT COUNT(*) c FROM opencode_users WHERE last_seen IS NOT NULL AND last_seen >= datetime('now','-1 day')");
  return {
    settings,
    notices,
    users,
    stats: { total, active, pending, disabled, online, expired: users.filter((u) => isExpired(u, now) && (u.status || '') === 'active').length },
  };
}

export async function applyOpenCodeAdminAction(db, p) {
  const action = String(p.action || '');
  const id = parseInt(p.user_id, 10) || 0;
  try {
    await ensureOpenCodeDB(db);
    if (action === 'toggle_global') {
      const current = await settingsMap(db);
      const next = String(current.global_enabled || '1') === '1' ? '0' : '1';
      await db.prepare("INSERT INTO opencode_settings (key,value) VALUES ('global_enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(next).run();
      return { ok: next === '1' ? 'OpenCode is now ON for all accounts.' : 'OpenCode is now OFF for all accounts.' };
    }
    if (action === 'save_settings') {
      const values = {
        global_enabled: String(p.global_enabled || '0') === '1' ? '1' : '0',
        maintenance_message: cleanName(p.maintenance_message, 500),
        support_url: String(p.support_url || '').trim().slice(0, 300),
        min_version_code: String(Math.max(1, parseInt(p.min_version_code, 10) || 1)),
      };
      for (const [key, value] of Object.entries(values)) {
        await db.prepare('INSERT INTO opencode_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value).run();
      }
      return { ok: 'OpenCode settings saved.' };
    }
    if (action === 'add_notice') {
      const title = cleanName(p.title, 120);
      const message = cleanName(p.message, 1200);
      if (!title || !message) return { error: 'Notice title and message are required.' };
      await db.prepare('INSERT INTO opencode_notices (title,message,is_active) VALUES (?,?,1)').bind(title, message).run();
      return { ok: 'Notice published.' };
    }
    if (action === 'toggle_notice') {
      const noticeId = parseInt(p.notice_id, 10) || 0;
      if (noticeId) await db.prepare('UPDATE opencode_notices SET is_active=1-is_active WHERE id=?').bind(noticeId).run();
      return { ok: 'Notice updated.' };
    }
    if (action === 'delete_notice') {
      const noticeId = parseInt(p.notice_id, 10) || 0;
      if (noticeId) await db.prepare('DELETE FROM opencode_notices WHERE id=?').bind(noticeId).run();
      return { ok: 'Notice deleted.' };
    }
    if (!id) return { error: 'User is required.' };

    if (action === 'activate_user' || action === 'extend_user') {
      const row = await db.prepare('SELECT id FROM opencode_users WHERE id=?').bind(id).first().catch(() => null);
      if (!row) return { error: 'User not found.' };
      const days = Math.max(1, Math.min(3650, parseInt(p.days, 10) || 30));
      const base = action === 'extend_user'
        ? Math.max(Date.now(), tsMs((await db.prepare('SELECT expires_at FROM opencode_users WHERE id=?').bind(id).first().catch(() => null))?.expires_at || 0))
        : Date.now();
      const expires = sqlTime(base + days * 864e5);
      await db.prepare("UPDATE opencode_users SET status='active',expires_at=?,last_seen=last_seen WHERE id=?").bind(expires, id).run();
      return { ok: 'Activated for ' + days + ' days.' };
    }
    if (action === 'disable_user') {
      await db.prepare("UPDATE opencode_users SET status='disabled' WHERE id=?").bind(id).run();
      return { ok: 'User disabled.' };
    }
    if (action === 'pending_user') {
      await db.prepare("UPDATE opencode_users SET status='pending' WHERE id=?").bind(id).run();
      return { ok: 'User moved back to pending.' };
    }
    if (action === 'reset_device') {
      await db.prepare("UPDATE opencode_users SET device_id='',device_name='' WHERE id=?").bind(id).run();
      await db.prepare('DELETE FROM opencode_sessions WHERE user_id=?').bind(id).run().catch(() => {});
      return { ok: 'Device reset. The user must login again.' };
    }
    if (action === 'revoke_sessions') {
      await db.prepare('DELETE FROM opencode_sessions WHERE user_id=?').bind(id).run().catch(() => {});
      return { ok: 'Sessions revoked.' };
    }
    if (action === 'delete_user') {
      await db.prepare('DELETE FROM opencode_sessions WHERE user_id=?').bind(id).run().catch(() => {});
      await db.prepare('DELETE FROM opencode_users WHERE id=?').bind(id).run();
      return { ok: 'User deleted.' };
    }
    return { error: 'Unknown action.' };
  } catch (e) {
    return { error: String(e?.message || 'Action failed') };
  }
}
