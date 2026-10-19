// BCORE SDK API — RC4/BCORE-wrapped key validation endpoint (/sdk/bcore/*).
import { bcoreSecretFromEnv, bcoreEncrypt, bcoreDecrypt, fixCesu8 } from './crypto.js';
import { tsMs } from './http.js';

export async function handleBcore(request, db, panelCode, env) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  const secret = bcoreSecretFromEnv(env);
  const send = (obj, code = 200) => new Response(bcoreEncrypt(JSON.stringify(obj), secret), { status: code, headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Cache-Control': 'no-store', ...cors } });
  if (request.method.toUpperCase() !== 'POST') return send({ status: 'error', code: 'METHOD_NOT_ALLOWED', message: 'Only POST method allowed' }, 405);
  try {
    // FIX (tenant-squatting): never auto-create panels from an unauthenticated
    // API path. Unknown/inactive panels are rejected like /connect and /mundo.
    const prow = await db.prepare('SELECT is_active FROM panels WHERE panel_code=?').bind(panelCode).first().catch(() => null);
    if (!prow || (prow.is_active | 0) !== 1) return send({ status: 'error', code: 'INVALID_PANEL', message: 'Invalid SDK key' }, 404);
    const raw = (await request.text()).trim();
    if (!raw) return send({ status: 'error', code: 'EMPTY_BODY', message: 'Request body is empty' }, 400);
    const decStr = fixCesu8(bcoreDecrypt(raw, secret)).toString('utf8');
    let input = null;
    try { const j = JSON.parse(decStr); if (j && typeof j === 'object') input = j; } catch {}
    if (!input) { try { input = Object.fromEntries(new URLSearchParams(decStr).entries()); } catch {} }
    if (!input || !input.sdk_key) return send({ status: 'error', code: 'DECRYPT_FAILED', message: 'Invalid encrypted payload' }, 400);
    const sdkKey = String(input.sdk_key || input.user_key || '').trim();
    const pkg = String(input.pkg_name || input.package_name || '').trim();
    const app = String(input.app_name || '').trim();
    const dev = String(input.device_id || '').trim();
    const mst = await db.prepare('SELECT maintenance_mode,maintenance_message FROM sdk_server_status WHERE panel_code=? AND engine=?').bind(panelCode, 'BCORE').first().catch(() => null);
    if (mst && (mst.maintenance_mode | 0) === 1) return send({ status: 'error', code: 'SERVER_MAINTENANCE', message: mst.maintenance_message || 'Server is under maintenance' }, 503);
    if (!sdkKey || !pkg || !app) return send({ status: 'error', code: 'MISSING_PARAMETER', message: 'Required parameter is missing' }, 400);
    const key = await db.prepare('SELECT * FROM bcore_keys WHERE sdk_key=? AND panel_code=? LIMIT 1').bind(sdkKey, panelCode).first().catch(() => null);
    if (!key) return send({ status: 'error', code: 'INVALID_KEY', message: 'Invalid SDK key' }, 400);
    if ((key.is_blocked | 0) === 1) return send({ status: 'error', code: 'INVALID_KEY', message: 'Invalid SDK key' }, 403);
    if (Date.now() > tsMs(key.created_at) + (key.duration_days | 0) * 864e5) return send({ status: 'error', code: 'EXPIRED_KEY', message: 'SDK key has expired' }, 403);
    const binds = (await db.prepare('SELECT * FROM bcore_key_bindings WHERE sdk_key_id=?').bind(key.id).all().catch(() => ({ results: [] }))).results || [];
    const pkgs = [...new Set(binds.map(b => b.pkg_name))];
    if (!pkgs.includes(pkg) && pkgs.length >= (key.pkg_limit | 0)) return send({ status: 'error', code: 'PKG_LIMIT_REACHED', message: 'Package limit reached' }, 403);
    let match = binds.find(b => b.pkg_name === pkg && b.app_name === app) || null;
    if (!match) {
      if (binds.length >= (key.pkg_limit | 0) * (key.app_limit | 0)) return send({ status: 'error', code: 'APP_LIMIT_REACHED', message: 'App name limit reached' }, 403);
      if (binds.filter(b => b.pkg_name === pkg).length >= (key.app_limit | 0)) return send({ status: 'error', code: 'APP_LIMIT_REACHED', message: 'App name limit reached' }, 403);
      await db.prepare('INSERT INTO bcore_key_bindings (sdk_key_id,pkg_name,app_name) VALUES (?,?,?)').bind(key.id, pkg, app).run();
      match = { is_blocked: 0 };
    }
    if ((match.is_blocked | 0) === 1) return send({ status: 'error', code: 'INVALID_KEY', message: 'This app binding is blocked' }, 403);
    const f1 = (key.feature1 | 0) === 1, f2 = (key.feature2 | 0) === 1;
    return send({ status: 'success', code: 'VALID', message: 'SDK key validated successfully', feature1: f1 ? 1 : 0, feature2: f2 ? 1 : 0, data: { sdk_key: 'valid', pkg_name: pkg, app_name: app, device_id: dev || 'registered', features1: f1, features2: f2 } });
  } catch (e) { return send({ status: 'error', code: 'DB_ERROR', message: 'Database query failed' }, 500); }
}
