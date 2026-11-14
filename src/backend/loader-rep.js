// Loader-rep — Ztrax-compatible encrypted license endpoint.
//
// The original loader (com.metanode.platform / libnet_core.so) talks to
// /ZTRAXPANEL/api.php?action=validate_license with this wire format:
//
//   body = base64(32-byte key) + "+++" + base64(ciphertext)
//   pt[i] = U[ct[i]] ^ D[i % 32] ^ key[i % 32]
//   ct[i] = U_inv[pt[i] ^ key[i % 32] ^ D[i % 32]]
//
// This module serves the SAME protocol from THIS panel (D1 api_keys), scoped
// to a panel_code (default YUVI_001). Keys generated in the panel work here;
// a device is bound on first successful validation and `uses` is bumped.
//
// Response envelope echoes the request key, exactly like the original panel.
import { cleanPanelCode, hitRate, clientIp } from './security.js';

export const LOADER_REP_DEFAULT_SECRET = 'trexjaat@StrongSecretKey#9876543210XYZabcdef';
export const LOADER_REP_DEFAULT_PACKAGE = 'com.pubg.imobile';

// Recovered cipher tables (see ztrax-conversations.md / ztrax-analyt.md).
const U = [
  0, 214, 14, 225, 152, 25, 253, 154, 123, 132, 124, 51, 244, 104, 97, 106,
  139, 108, 218, 52, 114, 95, 107, 117, 153, 55, 68, 133, 165, 35, 238, 102,
  129, 74, 177, 24, 61, 36, 92, 219, 47, 135, 241, 86, 4, 42, 100, 7,
  150, 31, 252, 13, 158, 226, 157, 56, 9, 66, 60, 198, 207, 118, 224, 221,
  8, 170, 41, 141, 53, 142, 178, 17, 161, 189, 131, 167, 195, 205, 57, 48,
  143, 136, 134, 128, 235, 239, 250, 34, 3, 209, 5, 65, 125, 247, 243, 181,
  176, 162, 126, 148, 183, 187, 96, 22, 105, 173, 130, 213, 186, 120, 197, 21,
  160, 159, 19, 119, 38, 91, 87, 20, 228, 127, 251, 84, 212, 80, 54, 78,
  26, 240, 208, 196, 71, 77, 163, 46, 113, 40, 103, 39, 168, 185, 45, 72,
  49, 191, 137, 28, 109, 255, 217, 245, 44, 234, 89, 174, 147, 201, 99, 15,
  69, 232, 18, 200, 211, 222, 229, 246, 79, 121, 12, 23, 62, 146, 59, 82,
  171, 1, 27, 70, 37, 32, 202, 156, 50, 98, 164, 43, 138, 231, 2, 169,
  83, 227, 190, 88, 182, 85, 101, 216, 248, 16, 144, 194, 93, 180, 175, 67,
  140, 192, 75, 254, 210, 249, 6, 215, 223, 237, 10, 115, 112, 230, 179, 111,
  188, 172, 90, 199, 63, 30, 233, 184, 166, 110, 122, 155, 116, 64, 242, 204,
  81, 94, 149, 11, 58, 73, 33, 29, 236, 206, 145, 76, 193, 220, 151, 203,
];

const D = [
  165, 245, 166, 242, 167, 241, 160, 240, 161, 247, 162, 246, 163, 245, 172, 242,
  173, 241, 164, 240, 165, 247, 166, 246, 167, 245, 160, 242, 161, 241, 162, 240,
];

const UINV = new Uint8Array(256);
for (let i = 0; i < 256; i++) UINV[U[i]] = i;

// ---- base64 helpers --------------------------------------------------------
function b64ToBytes(b64) {
  const bin = atob(String(b64 || '').trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// ---- cipher ----------------------------------------------------------------
export function decryptBytes(ct, key) {
  const out = new Uint8Array(ct.length);
  for (let i = 0; i < ct.length; i++) out[i] = U[ct[i]] ^ D[i & 31] ^ key[i & 31];
  return out;
}

export function encryptBytes(pt, key) {
  const out = new Uint8Array(pt.length);
  for (let i = 0; i < pt.length; i++) out[i] = UINV[pt[i] ^ key[i & 31] ^ D[i & 31]];
  return out;
}

export function buildEnvelope(payload, key) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const pt = new TextEncoder().encode(text);
  return bytesToB64(key) + '+++' + bytesToB64(encryptBytes(pt, key));
}

export function openEnvelope(body) {
  try {
    const s = String(body || '').trim();
    if (!s || s.indexOf('+++') < 0) return null;
    const parts = s.split('+++');
    if (parts.length !== 2) return null;
    const key = b64ToBytes(parts[0]);
    if (key.length !== 32) return null;
    const ct = b64ToBytes(parts[1]);
    if (!ct.length) return null;
    const pt = decryptBytes(ct, key);
    return { key, payload: JSON.parse(new TextDecoder().decode(pt)) };
  } catch {
    return null;
  }
}

// ---- helpers ---------------------------------------------------------------
export function loaderRepSecret(env) {
  const v = env && typeof env.LOADER_REP_SECRET === 'string' ? env.LOADER_REP_SECRET : '';
  return v || LOADER_REP_DEFAULT_SECRET;
}

function isoUtc(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function durationMs(duration) {
  const m = String(duration || '').toUpperCase().trim().match(/^(\d+)([DH])$/);
  if (!m) return 0;
  return m[2] === 'D' ? (+m[1]) * 864e5 : (+m[1]) * 36e5;
}

// SQLite stores UTC ("YYYY-MM-DD HH:MM:SS"). Ztrax labels the expiry with the
// requested timezone and appends "despite the 'IST' label" (its quirk).
function fmtExpiry(sqlTs, timeZoneRaw) {
  const ms = Date.parse(String(sqlTs || '').replace(' ', 'T') + 'Z');
  if (isNaN(ms)) return '';
  let zone = String(timeZoneRaw || '').trim() || 'UTC';
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    }).formatToParts(new Date(ms));
  } catch {
    zone = 'UTC';
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    }).formatToParts(new Date(ms));
  }
  const p = (t) => (parts.find((x) => x.type === t) || {}).value || '';
  const label = zone === 'Asia/Kolkata' ? 'IST' : zone === 'UTC' ? 'UTC' : zone;
  return `${p('month')}/${p('day')}/${p('year')}, ${p('hour')}:${p('minute')}:${p('second')} ${p('dayPeriod')} ${label}`;
}

// ---- core validation -------------------------------------------------------
// Returns { status, body } — the body is the JSON that gets encrypted.
// opts.dryRun = true: no DB writes, no device binding, no uses increment
// (used by the Loader-rep page live tester).
export async function processLoaderRep(db, env, panelRaw, action, payload, opts = {}) {
  const dryRun = opts.dryRun === true;
  const panel = cleanPanelCode(panelRaw) || 'YUVI_001';
  const secret = loaderRepSecret(env);
  const appSecret = String((payload && payload.app_secret) || '');
  if (appSecret !== secret) {
    return { status: 401, body: { status: 'error', message: 'all old app closed' } };
  }

  if (action === 'validate_license') {
    const hwid = String((payload && payload.hwid) || '');
    if (!/^[0-9a-f]{64}$/.test(hwid)) {
      return { status: 400, body: { status: 'error', message: 'Invalid HWID format' } };
    }

    const keyValue = String((payload && payload.key) || '').trim();
    if (!keyValue || keyValue.length > 64) {
      return { status: 400, body: { status: 'error', message: 'Invalid license key format' } };
    }

    const prow = await db.prepare('SELECT is_active FROM panels WHERE panel_code=?').bind(panel).first().catch(() => null);
    if (prow && (prow.is_active | 0) !== 1) {
      return { status: 403, body: { status: 'error', message: 'Panel is inactive' } };
    }

    const key = await db.prepare('SELECT * FROM api_keys WHERE key_value=? AND panel_code=? LIMIT 1').bind(keyValue, panel).first().catch(() => null);
    if (!key || (key.is_active | 0) !== 1) {
      return { status: 200, body: { status: 'error', message: 'Invalid license key' } };
    }
    if ((key.is_blocked | 0) === 1) {
      return { status: 200, body: { status: 'error', message: 'License blocked' } };
    }

    let expiry = key.expires_at;
    if (expiry) {
      const ms = Date.parse(String(expiry).replace(' ', 'T') + 'Z');
      if (!isNaN(ms) && ms < Date.now()) {
        return { status: 200, body: { status: 'error', message: 'License expired' } };
      }
    }

    const rows = (await db.prepare('SELECT device_uuid FROM key_devices WHERE key_id=?').bind(key.id).all().catch(() => ({ results: [] }))).results || [];
    const devices = rows.map((r) => r.device_uuid);
    const limit = Math.max(0, key.device_limit | 0);
    const alreadyBound = devices.includes(hwid);
    let newlyBound = false;

    if (!alreadyBound) {
      if (devices.length >= limit) {
        return { status: 200, body: { status: 'error', message: 'Device limit reached' } };
      }
      newlyBound = true;
      if (!dryRun) {
        if (!expiry) {
          const ms = durationMs(key.duration);
          if (!ms) return { status: 500, body: { status: 'error', message: 'Invalid key duration' } };
          expiry = isoUtc(Date.now() + ms);
          await db.prepare('UPDATE api_keys SET expires_at=?, uses=uses+1 WHERE id=?').bind(expiry, key.id).run();
        } else {
          await db.prepare('UPDATE api_keys SET uses=uses+1 WHERE id=?').bind(key.id).run();
        }
        await db.prepare('INSERT OR IGNORE INTO key_devices (key_id,device_uuid,panel_code) VALUES (?,?,?)').bind(key.id, hwid, panel).run();
      }
      devices.push(hwid);
    } else if (!dryRun) {
      await db.prepare("UPDATE key_devices SET last_seen=datetime('now') WHERE key_id=? AND device_uuid=?").bind(key.id, hwid).run();
    }

    if (!expiry) {
      // dry-run preview for a pending key (real flow materialises it above)
      expiry = isoUtc(Date.now() + (durationMs(key.duration) || 30 * 864e5));
    }

    const tzRaw = String((payload && payload.timezone) || '').trim().slice(0, 64);
    const timezone = tzRaw || 'UTC';
    const body = {
      status: 'success',
      success: true,
      message: newlyBound ? 'License valid and HWID bound' : 'License valid',
      expiry: fmtExpiry(expiry, timezone),
      timezone,
      timezone_note: `Expiry time is in your local timezone (${timezone}), despite the 'IST' label`,
      device_limit: limit,
      devices_used: devices.length,
      package_name: String((payload && payload.package_name) || (env && env.LOADER_REP_PACKAGE) || LOADER_REP_DEFAULT_PACKAGE),
    };
    return { status: 200, body };
  }

  if (action === 'get_update') {
    const pkg = String((payload && payload.package_name) || '').trim().slice(0, 80);
    if (!pkg) {
      return { status: 400, body: { status: 'error', message: 'Invalid package name' } };
    }
    // Panel-mapped equivalent (the original get_update field set was not
    // captured byte-for-byte). Uses this tenant's loader config + first mod
    // version URL.
    const cfg = await db.prepare('SELECT version FROM loader_config WHERE panel_code=?').bind(panel).first().catch(() => null);
    const ver = await db.prepare('SELECT name,tag,url FROM mod_versions WHERE panel_code=? ORDER BY sort ASC, id ASC LIMIT 1').bind(panel).first().catch(() => null);
    return {
      status: 200,
      body: {
        status: 'success',
        success: true,
        message: 'Update available',
        package_name: pkg,
        version: String((cfg && cfg.version) || '1.0'),
        version_name: ver ? String(ver.name || '') : '',
        version_tag: ver ? String(ver.tag || '') : '',
        game_status: 'Safe',
        download_url: ver ? String(ver.url || '') : '',
      },
    };
  }

  return { status: 400, body: { success: false, status: 'error', message: 'Invalid API request.' } };
}

// ---- HTTP handler ----------------------------------------------------------
function plain(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store', ...(cors || {}) },
  });
}

// Ztrax's native URL builder has a hardcoded 51-byte base URL and appends
// "?action=" itself. Accept the query aliases anyway, plus an action field in
// the (decrypted) body, so a wrong/absent query can never break login.
export function normalizeLoaderAction(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  const k = v.toLowerCase().replace(/[\s_-]+/g, '');
  if (k === 'validatelicense' || k === 'validate' || k === 'login') return 'validate_license';
  if (k === 'getupdate' || k === 'getupdates' || k === 'update' || k === 'checkupdate') return 'get_update';
  return '';
}

async function logLoaderRepDebug(db, row) {
  try {
    await db.prepare(
      'INSERT INTO loader_rep_debug (panel_code,method,path,query,action_raw,action_final,content_type,user_agent,ip,body_len,body_prefix,plain,http_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      row.panel, row.method, row.path, row.query, row.actionRaw, row.actionFinal,
      row.contentType, row.userAgent, row.ip, row.bodyLen, row.bodyPrefix, row.plain, row.status
    ).run();
    await db.prepare('DELETE FROM loader_rep_debug WHERE id <= (SELECT MAX(id) FROM loader_rep_debug) - 200').run().catch(() => {});
  } catch {
    // Debug logging must never break the loader endpoint.
  }
}

export async function handleLoaderRep(request, db, env, panelRaw) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Action',
  };
  const panel = cleanPanelCode(panelRaw) || cleanPanelCode(env && env.PANEL_CODE) || 'YUVI_001';
  const requestUrl = new URL(request.url);
  const method = request.method.toUpperCase();
  const meta = {
    panel,
    method,
    path: requestUrl.pathname,
    query: requestUrl.search.slice(0, 500),
    actionRaw: (requestUrl.searchParams.get('action') || '') + '|' + (request.headers.get('X-Action') || ''),
    contentType: (request.headers.get('Content-Type') || '').slice(0, 120),
    userAgent: (request.headers.get('User-Agent') || '').slice(0, 200),
    ip: clientIp(request),
    bodyLen: 0,
    bodyPrefix: '',
    plain: '',
    actionFinal: '',
    status: 0,
  };

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (method !== 'POST') {
    await logLoaderRepDebug(db, meta);
    return plain({ success: false, status: 'error', message: 'Invalid API request.' }, 400, cors);
  }

  const rl = hitRate('loader-rep:' + panel + ':' + clientIp(request), 240, 60e3);
  if (!rl.allowed) return plain({ success: false, status: 'error', message: 'Too many requests' }, 429, cors);

  const raw = await request.text().catch(() => '');
  meta.bodyLen = raw.length;
  meta.bodyPrefix = raw.slice(0, 2000);
  const opened = openEnvelope(raw);
  if (opened) meta.plain = JSON.stringify(opened.payload).slice(0, 4000);

  let action = normalizeLoaderAction(requestUrl.searchParams.get('action'))
    || normalizeLoaderAction(request.headers.get('X-Action'));
  if (!action && opened && opened.payload) {
    const p = opened.payload;
    action = normalizeLoaderAction(p.action) || normalizeLoaderAction(p.type) || normalizeLoaderAction(p.method);
    if (!action) {
      // Action-less legacy clients: infer from the request fields.
      if (p.hwid !== undefined || p.key !== undefined) action = 'validate_license';
      else if (p.package_name !== undefined) action = 'get_update';
    }
  }
  meta.actionFinal = action;

  if (!opened) {
    meta.status = 400;
    await logLoaderRepDebug(db, meta);
    return plain({ success: false, status: 'error', message: 'Invalid request body' }, 400, cors);
  }

  const result = await processLoaderRep(db, env, panel, action, opened.payload);
  meta.status = result.status;
  await logLoaderRepDebug(db, meta);

  const out = buildEnvelope(result.body, opened.key);
  return new Response(out, {
    status: result.status,
    headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Cache-Control': 'no-store', ...cors },
  });
}