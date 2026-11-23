// MAK administration is authorised by the existing SDK Panel session
// (sdk_session cookie + users row). No second login or separate admin table is
// introduced: the panel owner who can already see the SDK Panel can manage MAK.
//
// CSRF tokens are derived from the session token, so they rotate with the
// session and never need to be stored separately.

import { getSession } from '../backend/session.js';
import { parseCookies } from '../backend/http.js';
import { sha256Hex } from './crypto.js';

export const MAK_COOKIE = 'sdk_session';

export async function getAdminSession(db, request) {
  const row = await getSession(db, request);
  if (!row) return null;
  const allowed = Number(row.id) === 1 || String(row.role || '').toUpperCase() === 'PROFESSOR';
  if (!allowed) return null;
  const token = parseCookies(request)[MAK_COOKIE] || '';
  const csrf = await sha256Hex('MAK/CSRF/1|' + token);
  return { ...row, csrf, admin: true };
}

export function verifyCsrf(session, supplied) {
  if (!session || !session.csrf) return false;
  const value = String(supplied || '');
  if (value.length !== session.csrf.length) return false;
  let diff = 0;
  for (let i = 0; i < value.length; i++) diff |= value.charCodeAt(i) ^ session.csrf.charCodeAt(i);
  return diff === 0;
}
