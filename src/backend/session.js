// Session layer — sdk_session cookie -> users row, plus cookie helpers.
import { parseCookies } from './http.js';
import { clearSessionCookie, sessionCookie } from './security.js';

export async function getSession(db, req) {
  const t = parseCookies(req)['sdk_session'];
  if (!t) return null;
  const row = await db.prepare('SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').bind(t).first().catch(() => null);
  if (!row) return null;
  if ((row.expires_at || 0) < Date.now()) { try { await db.prepare('DELETE FROM sessions WHERE token=?').bind(t).run(); } catch {} return null; }
  return row;
}

export const sessCookie = (t, req) => sessionCookie(t, req);
export const clearCookie = () => clearSessionCookie();
