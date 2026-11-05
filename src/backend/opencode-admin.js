// Standalone admin auth for the OpenCode control panel.
//
// This is deliberately separate from the SDK panel session:
//   cookie `oc_admin` -> opencode_admin_sessions
//
// An SDK session for panel user id === 1 is also accepted by the router as a
// fallback, so the owner can open /opencode from the main panel without a
// second login. Everyone else must use /opencode/login.
//
// Admin password source (first configured wins):
//   1. OPENCODE_ADMIN_PASSWORD
//   2. PANEL_ADMIN_PASSWORD
//   3. OPENCODE_ENC_KEY (fallback; documented in docs/OPENCODE.md)
//
// Secrets are Cloudflare Worker secrets and are never rendered or logged.

import { parseCookies } from './http.js';
import { clientIp, hitRate } from './security.js';

const COOKIE = 'oc_admin';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LEN = 6;

const ADMIN_SCHEMA = `
CREATE TABLE IF NOT EXISTS opencode_admin_sessions (
  token_hash TEXT PRIMARY KEY,
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opencode_admin_exp ON opencode_admin_sessions(expires_at);
`;

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'oca_' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function safeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function secureSuffix(request) {
  try {
    return new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  } catch {
    return '';
  }
}

// Cheap, idempotent bootstrap. Do not cache globally: the test harness and D1
// previews can swap databases inside a single isolate.
export async function ensureOpenCodeAdminDB(db) {
  const statements = ADMIN_SCHEMA.split(';').map((sql) => sql.trim()).filter(Boolean);
  for (const sql of statements) {
    await db.prepare(sql).run();
  }
}

export function adminPasswordSource(env) {
  const candidates = [
    ['OPENCODE_ADMIN_PASSWORD', env?.OPENCODE_ADMIN_PASSWORD],
    ['PANEL_ADMIN_PASSWORD', env?.PANEL_ADMIN_PASSWORD],
    ['OPENCODE_ENC_KEY', env?.OPENCODE_ENC_KEY],
  ];
  for (const [name, value] of candidates) {
    if (typeof value === 'string' && value.trim().length >= MIN_PASSWORD_LEN) return name;
  }
  return '';
}

export function adminPasswordConfigured(env) {
  return !!adminPasswordSource(env);
}

function configuredPassword(env) {
  const source = adminPasswordSource(env);
  if (!source) return '';
  const value = String(env[source] || '').trim();
  return value.length >= MIN_PASSWORD_LEN ? value : '';
}

export async function verifyAdminPassword(env, password) {
  const expected = configuredPassword(env);
  if (!expected) return { ok: false, configured: false };
  const [got, want] = await Promise.all([
    sha256Hex(String(password || '')),
    sha256Hex(expected),
  ]);
  return { ok: safeEqual(got, want), configured: true };
}

export function adminLoginRate(request) {
  return hitRate('oc-admin-login:' + clientIp(request), 8, 60e3);
}

export function adminCookie(token, request) {
  return COOKIE + '=' + encodeURIComponent(token)
    + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(SESSION_MS / 1000)
    + secureSuffix(request);
}

export function clearAdminCookie(request) {
  return COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secureSuffix(request);
}

export async function getOpenCodeAdminSession(db, request) {
  await ensureOpenCodeAdminDB(db);
  const token = parseCookies(request)[COOKIE];
  if (!token || token.length < 20) return null;
  const hash = await sha256Hex(token);
  const row = await db.prepare('SELECT * FROM opencode_admin_sessions WHERE token_hash=?').bind(hash).first().catch(() => null);
  if (!row) return null;
  if (Number(row.expires_at || 0) <= Date.now()) {
    await db.prepare('DELETE FROM opencode_admin_sessions WHERE token_hash=?').bind(hash).run().catch(() => {});
    return null;
  }
  return row;
}

export async function createOpenCodeAdminSession(db, request) {
  await ensureOpenCodeAdminDB(db);
  const token = randomToken();
  await db.prepare('INSERT INTO opencode_admin_sessions (token_hash,ip,expires_at) VALUES (?,?,?)')
    .bind(await sha256Hex(token), clientIp(request), Date.now() + SESSION_MS)
    .run();
  await db.prepare('DELETE FROM opencode_admin_sessions WHERE expires_at<=?')
    .bind(Date.now())
    .run()
    .catch(() => {});
  return token;
}

export async function destroyOpenCodeAdminSession(db, request) {
  await ensureOpenCodeAdminDB(db);
  const token = parseCookies(request)[COOKIE];
  if (!token) return;
  await db.prepare('DELETE FROM opencode_admin_sessions WHERE token_hash=?')
    .bind(await sha256Hex(token))
    .run()
    .catch(() => {});
}

export function opencodeEncryptionConfigured(env) {
  return /^[a-f0-9]{64}$/i.test(String(env?.OPENCODE_ENC_KEY || '').trim());
}
