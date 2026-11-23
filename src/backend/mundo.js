// MUNDO SDK API — AES-wrapped key validation endpoint (/sdk/mundo/*).
import { mundoAesKey, mundoSaltFromEnv, aesEncryptRaw, aesDecryptRaw } from './crypto.js';
import { tsMs } from './http.js';

export async function handleMundo(request, db, panelCode, env) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  const keyRaw = mundoAesKey(mundoSaltFromEnv(env));
  const send = (obj, code = 200) => new Response(aesEncryptRaw(JSON.stringify(obj), keyRaw), { status: code, headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Cache-Control': 'no-store', ...cors } });
  if (request.method.toUpperCase() !== 'POST') return send({ status: false, code: 'error', message: 'Only POST' }, 405);
  try {
    const prow = await db.prepare('SELECT is_active FROM panels WHERE panel_code=?').bind(panelCode).first().catch(() => null);
    if (prow && (prow.is_active | 0) !== 1) return send({ status: false, code: 'error', message: 'Panel not found' }, 404);
    const raw = (await request.text()).trim();
    if (!raw) return send({ status: false, code: 'error', message: 'Empty body' }, 400);
    let enc = raw;
    try { const sp = new URLSearchParams(raw); if (sp.get('data')) enc = sp.get('data'); } catch {}
    const dec = aesDecryptRaw(enc, keyRaw);
    if (!dec) return send({ status: false, code: 'error', message: 'Decryption failed' }, 400);
    const parts = dec.split('|');
    if (parts.length < 4) return send({ status: false, code: 'error', message: 'Malformed payload' }, 400);
    const S1 = parts[0], S2 = parts[1], S3A = parts[2];
    const all = (await db.prepare('SELECT * FROM mundo_keys WHERE panel_code=?').bind(panelCode).all().catch(() => ({ results: [] }))).results || [];
    let key = null, hwid = '';
    for (const k of all) { if (S1.startsWith(k.sdk_key)) { key = k; hwid = S1.slice(k.sdk_key.length); break; } }
    if (!key) return send({ status: false, code: 'error', message: 'Invalid SDK key' }, 403);
    let pkg = '', app = '';
    if (S2.endsWith(S1)) { const pre = S2.slice(0, -S1.length); if (pre.length % 2 === 0 && pre.slice(0, pre.length / 2) === pre.slice(pre.length / 2)) pkg = pre.slice(0, pre.length / 2); }
    if (S3A.endsWith(key.sdk_key)) { const pre = S3A.slice(0, -key.sdk_key.length); if (pre.length % 2 === 0 && pre.slice(0, pre.length / 2) === pre.slice(pre.length / 2)) app = pre.slice(0, pre.length / 2); }
    if (!pkg || !app) return send({ status: false, code: 'error', message: 'Malformed pkg/app' }, 400);
    const mst = await db.prepare('SELECT maintenance_mode,maintenance_message FROM sdk_server_status WHERE panel_code=? AND engine=?').bind(panelCode, 'MUNDO').first().catch(() => null);
    if (mst && (mst.maintenance_mode | 0) === 1) return send({ status: false, code: 'error', message: mst.maintenance_message || 'Server is under maintenance' }, 503);
    if ((key.is_blocked | 0) === 1) return send({ status: false, code: 'error', message: 'SDK key blocked' }, 403);
    if (Date.now() > tsMs(key.created_at) + (key.duration_days | 0) * 864e5) return send({ status: false, code: 'error', message: 'SDK key expired' }, 403);
    const binds = (await db.prepare('SELECT * FROM mundo_key_bindings WHERE sdk_key_id=?').bind(key.id).all().catch(() => ({ results: [] }))).results || [];
    const pkgs = [...new Set(binds.map(b => b.pkg_name))];
    if (!pkgs.includes(pkg) && pkgs.length >= (key.pkg_limit | 0)) return send({ status: false, code: 'error', message: 'Package limit reached' }, 403);
    let match = binds.find(b => b.pkg_name === pkg && b.app_name === app) || null;
    if (!match) {
      if (binds.length >= (key.pkg_limit | 0) * (key.app_limit | 0)) return send({ status: false, code: 'error', message: 'App limit reached' }, 403);
      if (binds.filter(b => b.pkg_name === pkg).length >= (key.app_limit | 0)) return send({ status: false, code: 'error', message: 'App limit reached' }, 403);
      await db.prepare('INSERT INTO mundo_key_bindings (sdk_key_id,pkg_name,app_name) VALUES (?,?,?)').bind(key.id, pkg, app).run();
      match = { is_blocked: 0 };
    }
    if ((match.is_blocked | 0) === 1) return send({ status: false, code: 'error', message: 'Binding blocked' }, 403);
    return send({ status: true, code: 'success', message: 'SDK key validated successfully', sdk_key: key.sdk_key, pkg_name: pkg, app_name: app, device_id: hwid, expires: new Date(tsMs(key.created_at) + (key.duration_days | 0) * 864e5).toISOString().slice(0, 19).replace('T', ' ') });
  } catch (e) { return send({ status: false, code: 'error', message: 'DB error' }, 500); }
}
