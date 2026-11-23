// Panel administrator authentication. Sessions are random bearer tokens stored
// as SHA-256 hashes in D1; the cookie is HttpOnly + SameSite=Strict, and every
// mutating panel form also carries a per-session CSRF token.

import {
  b64url,
  hashPassword,
  randomBytes,
  safeEqual,
  sha256Hex,
  verifyPassword,
  nowS,
} from './crypto.js';
import { parseCookies, serializeCookie, clearCookie, isSecureRequest } from './http.js';

export const ADMIN_COOKIE = 'mak_admin';
export const ADMIN_SESSION_TTL = 7 * 86400;

export async function adminCount(db) {
  const row = await db.prepare('SELECT COUNT(*) AS c FROM mak_admins').first().catch(() => null);
  return Number(row?.c || 0);
}

export async function setupRequired(db) {
  return (await adminCount(db)) === 0;
}

export async function findAdminByUsername(db, username) {
  return db.prepare('SELECT * FROM mak_admins WHERE username=?').bind(String(username || '').trim()).first().catch(() => null);
}

export async function createAdmin(db, { username, password, role = 'OWNER' }) {
  const hash = await hashPassword(password);
  const now = nowS();
  await db.prepare('INSERT INTO mak_admins (username,password_hash,role,created_at) VALUES (?,?,?,?)')
    .bind(username, hash, role, now).run();
  return findAdminByUsername(db, username);
}

export async function setAdminPassword(db, adminId, password) {
  const hash = await hashPassword(password);
  await db.prepare('UPDATE mak_admins SET password_hash=? WHERE id=?').bind(hash, adminId).run();
}

export async function createAdminSession(db, adminId) {
  const token = b64url(randomBytes(32));
  const tokenHash = await sha256Hex('MAK-ADMIN-SESSION|' + token);
  const csrf = b64url(randomBytes(24));
  const now = nowS();
  await db.prepare(
    'INSERT INTO mak_admin_sessions (token_hash,admin_id,csrf,created_at,expires_at,last_seen) VALUES (?,?,?,?,?,?)',
  ).bind(tokenHash, adminId, csrf, now, now + ADMIN_SESSION_TTL, now).run();
  return { token, csrf, expiresAt: now + ADMIN_SESSION_TTL };
}

export function adminCookie(request, token) {
  return serializeCookie(ADMIN_COOKIE, token, {
    maxAge: ADMIN_SESSION_TTL,
    httpOnly: true,
    sameSite: 'Strict',
    secure: isSecureRequest(request),
  });
}

export function adminClearCookie() {
  return clearCookie(ADMIN_COOKIE);
}

export async function getAdminSession(db, request) {
  const token = parseCookies(request)[ADMIN_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256Hex('MAK-ADMIN-SESSION|' + token);
  const row = await db.prepare(
    `SELECT s.id AS session_id, s.csrf, s.expires_at AS session_expires_at,
            a.id, a.username, a.role, a.created_at, a.last_login
       FROM mak_admin_sessions s JOIN mak_admins a ON a.id=s.admin_id
      WHERE s.token_hash=?`,
  ).bind(tokenHash).first().catch(() => null);
  if (!row) return null;
  const now = nowS();
  if (Number(row.session_expires_at) <= now) {
    await db.prepare('DELETE FROM mak_admin_sessions WHERE id=?').bind(row.session_id).run().catch(() => {});
    return null;
  }
  return row;
}

export async function destroyAdminSession(db, request) {
  const token = parseCookies(request)[ADMIN_COOKIE];
  if (!token) return;
  const tokenHash = await sha256Hex('MAK-ADMIN-SESSION|' + token);
  await db.prepare('DELETE FROM mak_admin_sessions WHERE token_hash=?').bind(tokenHash).run().catch(() => {});
}

export async function destroyOtherAdminSessions(db, adminId, request) {
  const token = parseCookies(request)[ADMIN_COOKIE];
  const keep = token ? await sha256Hex('MAK-ADMIN-SESSION|' + token) : '';
  await db.prepare('DELETE FROM mak_admin_sessions WHERE admin_id=? AND token_hash<>?').bind(adminId, keep).run().catch(() => {});
}

export async function verifyAdminLogin(db, username, password) {
  const admin = await findAdminByUsername(db, username);
  if (!admin) return null;
  if (!(await verifyPassword(password, admin.password_hash))) return null;
  await db.prepare('UPDATE mak_admins SET last_login=? WHERE id=?').bind(nowS(), admin.id).run().catch(() => {});
  return admin;
}

export function verifyCsrf(session, token) {
  if (!session?.csrf || !token) return false;
  return safeEqual(session.csrf, String(token));
}

export async function revokeAllAdminSessions(db) {
  await db.prepare('DELETE FROM mak_admin_sessions').run().catch(() => {});
}
