// JSON API for the Next.js frontend (Phase-1 bridge).
// Reuses the SAME tables, session cookie (sdk_session) and tenant-scoping
// rules as the HTML panel. Preserves /connect/* and /encrypt/* contracts.
//
// Auth: cookie session, same as HTML. CORS: FRONTEND_ORIGIN env must match
// the deployed web app origin when cross-origin (credentials: include).
// All timestamps stored UTC; responses include `_ist` display strings.

import { verifyPassword } from './crypto.js';
import { createDecipheriv } from 'node:crypto';
import { deviceFingerprint } from './p-auth.js';
import {
  apiCors,
  assertPanelActive,
  cleanPanelCode,
  cleanStr,
  clearSessionCookie,
  clientIp,
  formatIST,
  hitRate,
  isProfessor,
  json,
  parseCookies,
  resolvePanel,
  roleRank,
  sessionCookie,
  tsMs,
} from './security.js';

const KEY_PRICING = { '2H': 10, '1D': 80, '3D': 150, '7D': 250, '15D': 350, '30D': 500, '60D': 900 };
const KEY_DURATIONS = ['2H', '1D', '3D', '7D', '15D', '30D', '60D'];
// Bump on every behaviour-changing release; visible at /api/health.
const WORKER_VERSION = '1.2.0';

function arcxRand(len) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const r = new Uint8Array(len);
  crypto.getRandomValues(r);
  return [...r].map((b) => chars[b % 36]).join('');
}

async function getSession(db, req) {
  const t = parseCookies(req)['sdk_session'];
  if (!t) return null;
  const row = await db
    .prepare('SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?')
    .bind(t)
    .first()
    .catch(() => null);
  if (!row) return null;
  if ((row.expires_at || 0) < Date.now()) {
    try { await db.prepare('DELETE FROM sessions WHERE token=?').bind(t).run(); } catch {}
    return null;
  }
  return row;
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    full_name: u.full_name || '',
    role: u.role,
    panel_code: u.panel_code,
    balance: u.role === 'OWNER' || u.role === 'PROFESSOR' ? null : u.balance | 0,
    unlimited: u.role === 'OWNER' || u.role === 'PROFESSOR',
  };
}

async function readBody(req) {
  try {
    const ct = req.headers.get('Content-Type') || '';
    if (ct.includes('json')) return await req.json();
    if (ct.includes('form') || ct.includes('multipart')) {
      const fd = await req.formData();
      return Object.fromEntries(fd.entries());
    }
    // fallback: try JSON
    try { return await req.json(); } catch { return {}; }
  } catch { return {}; }
}

function needAuth(sess) {
  if (!sess) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  if ((sess.is_blocked | 0) === 1) return json({ ok: false, error: 'ACCOUNT_BLOCKED' }, 403);
  return null;
}

export async function handleApi(request, db, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/')) return null;
  const cors = apiCors(request, env);
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const J = (obj, code = 200, extra) => json(obj, code, { ...cors, ...(extra || {}) });

  // ---- public ---------------------------------------------------------------
  // v reports the running build so deploys can be verified remotely.
  if (path === '/api/health') {
    return J({ ok: true, panel: env.PANEL_CODE || 'YUVI_001', time_utc: new Date().toISOString(), v: WORKER_VERSION });
  }

  if (path === '/api/login' && method === 'POST') {
    const rl = hitRate('login:' + clientIp(request), 10, 60e3);
    if (!rl.allowed) return J({ ok: false, error: 'Too many attempts. Retry later.' }, 429);
    const p = await readBody(request);
    const u = cleanStr(p.username, 64), pw = String(p.password || '');
    if (!u || !pw) return J({ ok: false, error: 'Username and password required.' }, 400);
    const row = await db.prepare('SELECT * FROM users WHERE username=?').bind(u).first().catch(() => null);
    const { verifyPassword: vp } = await import('./crypto.js');
    if (!row || !(await vp(pw, row.password_hash))) return J({ ok: false, error: 'Invalid username or password.' }, 401);
    if ((row.is_blocked | 0) === 1) return J({ ok: false, error: 'Account suspended.' }, 403);
    if (row.id !== 1 && !isProfessor(row)) {
      const fp = await deviceFingerprint(String(p.device_info || '{}'), request.headers.get('User-Agent'), request.headers.get('Accept-Language'));
      if (!row.device_fingerprint) {
        await db.prepare("UPDATE users SET device_fingerprint=?,last_login=datetime('now') WHERE id=?").bind(fp, row.id).run();
      } else if (row.device_fingerprint !== fp) {
        return J({ ok: false, error: 'DEVICE_LOCKED', message: 'Account locked on another device. Reset device first.' }, 403);
      } else {
        await db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").bind(row.id).run();
      }
    } else {
      await db.prepare("UPDATE users SET device_fingerprint=?,last_login=datetime('now') WHERE id=?").bind(
        await deviceFingerprint(String(p.device_info || '{}'), request.headers.get('User-Agent'), request.headers.get('Accept-Language')), row.id).run();
    }
    const t = crypto.randomUUID();
    await db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').bind(t, row.id, Date.now() + 6048e5).run();
    return J({ ok: true, user: publicUser(row) }, 200, { 'Set-Cookie': sessionCookie(t, request) });
  }

  if (path === '/api/logout' && method === 'POST') {
    const t = parseCookies(request)['sdk_session'];
    if (t) await db.prepare('DELETE FROM sessions WHERE token=?').bind(t).run().catch(() => {});
    return J({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  }

  // ---- authenticated ---------------------------------------------------------
  const sess = await getSession(db, request);
  {
    const err = needAuth(sess);
    if (err) {
      const h = {};
      for (const [k, v] of Object.entries(cors)) h[k] = v;
      return json(await err.json(), err.status, h);
    }
  }
  const mainPanel = env.PANEL_CODE || 'YUVI_001';
  const myPanel = sess.panel_code || mainPanel;
  const myId = sess.id;
  const myRole = String(sess.role || 'RESELLER').toUpperCase();
  const isOA = myRole === 'OWNER' || myRole === 'ADMIN' || myRole === 'PROFESSOR';
  const isOwnerLike = myRole === 'OWNER' || myRole === 'PROFESSOR';

  if (path === '/api/me') {
    const me = await db.prepare('SELECT * FROM users WHERE id=?').bind(myId).first().catch(() => sess);
    return J({ ok: true, user: publicUser(me || sess) });
  }

  // ---- dashboard (same queries as HTML panel) --------------------------------
  if (path === '/api/dashboard') {
    const me = await db.prepare('SELECT balance FROM users WHERE id=?').bind(myId).first().catch(() => ({}));
    const balance = myRole === 'OWNER' || myRole === 'PROFESSOR' ? null : Number(me?.balance || 0);
    let stats = {};
    if (myRole === 'OWNER' || myRole === 'PROFESSOR') {
      const scope = isProfessor(sess) ? (resolvePanel(sess, mainPanel, url.searchParams.get('panel')) || myPanel) : myPanel;
      const r = await db.prepare(
        "SELECT (SELECT COUNT(*) FROM users WHERE panel_code=? AND role='ADMIN') a,(SELECT COUNT(*) FROM users WHERE panel_code=? AND role='RESELLER') r,(SELECT COUNT(*) FROM api_keys WHERE panel_code=?) t,(SELECT COUNT(*) FROM api_keys WHERE panel_code=? AND is_blocked=0) ac"
      ).bind(scope, scope, scope, scope).first().catch(() => ({}));
      stats = { total_admins: r?.a || 0, total_resellers: r?.r || 0, total_keys: r?.t || 0, active_keys: r?.ac || 0, panel_code: scope };
    } else if (myRole === 'ADMIN') {
      const r = await db.prepare(
        "SELECT (SELECT COUNT(*) FROM users WHERE panel_code=? AND role='RESELLER' AND invited_by=?) a,(SELECT COUNT(*) FROM api_keys WHERE panel_code=? AND created_by=?) b,(SELECT COUNT(*) FROM api_keys k JOIN users u ON k.created_by=u.id WHERE k.panel_code=? AND u.role='RESELLER' AND u.invited_by=?) c,(SELECT COUNT(*) FROM api_keys WHERE panel_code=? AND created_by=? AND is_blocked=0) d"
      ).bind(myPanel, myId, myPanel, myId, myPanel, myId, myPanel, myId).first().catch(() => ({}));
      stats = { my_resellers: r?.a || 0, my_keys: r?.b || 0, my_reseller_keys: r?.c || 0, my_active_keys: r?.d || 0, team_keys: (r?.b || 0) + (r?.c || 0) };
    } else {
      const r = await db.prepare(
        'SELECT (SELECT COUNT(*) FROM api_keys WHERE panel_code=? AND created_by=?) a,(SELECT COUNT(*) FROM api_keys WHERE panel_code=? AND created_by=? AND is_blocked=0) b'
      ).bind(myPanel, myId, myPanel, myId).first().catch(() => ({}));
      stats = { my_keys: r?.a || 0, my_active_keys: r?.b || 0 };
    }
    return J({ ok: true, user: publicUser(sess), balance, stats, server_time_utc: new Date().toISOString() });
  }

  // ---- keys -------------------------------------------------------------------
  const canMod = async (kid) => {
    const k = await db.prepare('SELECT * FROM api_keys WHERE id=? AND panel_code=?').bind(kid, myPanel).first().catch(() => null);
    if (!k) return null;
    if (isOwnerLike) return k;
    if (k.created_by === myId) return k;
    if (myRole === 'ADMIN') {
      const c = await db.prepare('SELECT invited_by FROM users WHERE id=?').bind(k.created_by).first().catch(() => null);
      if (c && (c.invited_by | 0) === myId) return k;
    }
    return null;
  };

  if (path === '/api/keys' && method === 'GET') {
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const status = (url.searchParams.get('status') || 'all').toLowerCase();
    const server = (url.searchParams.get('server') || 'all').toUpperCase();
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(5, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));
    let q = 'SELECT k.*,(SELECT COUNT(*) FROM key_devices d WHERE d.key_id=k.id) dev_count,(SELECT username FROM users WHERE id=k.created_by) creator FROM api_keys k WHERE k.panel_code=? ';
    const args = [myPanel];
    if (myRole === 'ADMIN') { q += 'AND (k.created_by=? OR k.created_by IN (SELECT id FROM users WHERE invited_by=?)) '; args.push(myId, myId); }
    else if (myRole === 'RESELLER') { q += 'AND k.created_by=? '; args.push(myId); }
    q += 'ORDER BY k.id DESC LIMIT 500';
    let rows = (await db.prepare(q).bind(...args).all().catch(() => ({ results: [] }))).results || [];
    if (search) rows = rows.filter((k) => String(k.key_value || '').toLowerCase().includes(search) || String(k.creator || '').toLowerCase().includes(search));
    if (status === 'active') rows = rows.filter((k) => !(k.is_blocked | 0));
    else if (status === 'blocked') rows = rows.filter((k) => (k.is_blocked | 0) === 1);
    else if (status === 'expired') rows = rows.filter((k) => k.expires_at && tsMs(k.expires_at) < Date.now());
    if (['PRIVATE', 'PUBLIC', 'ADMIN', 'SAFE'].includes(server)) rows = rows.filter((k) => String(k.server_type || 'PRIVATE').toUpperCase() === server);
    const total = rows.length;
    const items = rows.slice((page - 1) * pageSize, page * pageSize).map((k) => ({
      ...k,
      expires_at_ist: k.expires_at ? formatIST(k.expires_at) : null,
      expired: k.expires_at ? tsMs(k.expires_at) < Date.now() : false,
    }));
    return J({ ok: true, items, total, page, pageSize });
  }

  if (path === '/api/keys' && method === 'POST') {
    const p = await readBody(request);
    const a = String(p.action || '');
    if ((a === 'delete_all' || a === 'delete_expired' || a === 'extend_all') && isOwnerLike && p.bulk) {
      if (a === 'delete_all') { await db.prepare('DELETE FROM api_keys WHERE panel_code=?').bind(myPanel).run(); return J({ ok: true, message: 'All panel keys deleted.' }); }
      if (a === 'delete_expired') { await db.prepare("DELETE FROM api_keys WHERE panel_code=? AND expires_at IS NOT NULL AND expires_at<datetime('now')").bind(myPanel).run(); return J({ ok: true, message: 'Expired keys deleted.' }); }
      const v = parseInt(p.extend_val, 10) || 0, u = String(p.extend_unit || 'D').toUpperCase() === 'H' ? 'hours' : 'days';
      if (v <= 0) return J({ ok: false, error: 'Invalid extend value.' }, 400);
      await db.prepare("UPDATE api_keys SET expires_at=datetime(COALESCE(expires_at,'now'),?) WHERE panel_code=?").bind('+' + v + ' ' + u, myPanel).run();
      return J({ ok: true, message: 'All keys extended.' });
    }
    const kid = parseInt(p.key_id, 10) || 0;
    if (a === 'reset_device' && kid) {
      if (!(await canMod(kid))) return J({ ok: false, error: 'Not allowed.' }, 403);
      await db.prepare('DELETE FROM key_devices WHERE key_id=?').bind(kid).run();
      return J({ ok: true, message: 'Devices reset.' });
    }
    if (a === 'delete_key' && kid) {
      if (!(await canMod(kid))) return J({ ok: false, error: 'Not allowed.' }, 403);
      await db.prepare('DELETE FROM api_keys WHERE id=?').bind(kid).run();
      return J({ ok: true, message: 'Key deleted.' });
    }
    if (a === 'edit_key' && kid) {
      const k = await canMod(kid);
      if (!k) return J({ ok: false, error: 'Not allowed.' }, 403);
      const blk = String(p.edit_status) === '0' ? 1 : 0;
      await db.prepare('UPDATE api_keys SET is_blocked=? WHERE id=?').bind(blk, k.id).run();
      const ev = parseInt(p.extend_val, 10) || 0;
      if (ev > 0) {
        const eu = String(p.extend_unit || 'D').toUpperCase() === 'H' ? 'hours' : 'days';
        // FIX: never mangle duration on pending keys (see index.js edit_key).
        if (!k.expires_at) {
          const dm = String(k.duration || '').toUpperCase().match(/^(\d+)([DH])$/);
          const base = dm ? (dm[2] === 'D' ? (+dm[1]) * 864e5 : (+dm[1]) * 36e5) : 0;
          const exp = new Date(Date.now() + base + (eu === 'hours' ? ev * 36e5 : ev * 864e5)).toISOString().slice(0, 19).replace('T', ' ');
          await db.prepare('UPDATE api_keys SET expires_at=? WHERE id=?').bind(exp, k.id).run();
        } else await db.prepare('UPDATE api_keys SET expires_at=datetime(expires_at,?) WHERE id=?').bind('+' + ev + ' ' + eu, k.id).run();
      }
      if (isOwnerLike && p.edit_server && ['PRIVATE', 'PUBLIC', 'ADMIN', 'SAFE'].includes(String(p.edit_server))) {
        await db.prepare('UPDATE api_keys SET server_type=? WHERE id=?').bind(String(p.edit_server), k.id).run();
      }
      return J({ ok: true, message: 'Key updated.' });
    }
    return J({ ok: false, error: 'Invalid action.' }, 400);
  }

  // ---- generate -----------------------------------------------------------------
  if (path === '/api/generate' && method === 'POST') {
    const p = await readBody(request);
    const dur = String(p.duration || '');
    const limit = Math.min(10, Math.max(1, parseInt(p.device_limit, 10) || 1));
    const amount = Math.min(500, Math.max(1, parseInt(p.bulk_amount, 10) || parseInt(p.quantity, 10) || 1));
    const custom = cleanStr(p.custom_key, 50);
    let server = 'PRIVATE';
    if (isOwnerLike) {
      const s = String(p.server_type || 'PRIVATE').toUpperCase();
      if (['ADMIN', 'SAFE', 'PRIVATE', 'PUBLIC'].includes(s)) server = s;
    }
    if (!KEY_DURATIONS.includes(dur)) return J({ ok: false, error: 'Invalid duration.' }, 400);
    if (!(await assertPanelActive(db, myPanel))) return J({ ok: false, error: 'Panel not found.' }, 404);
    const total = (KEY_PRICING[dur] || 10) * limit * amount;
    if (!isOwnerLike) {
      const me = await db.prepare('SELECT balance FROM users WHERE id=?').bind(myId).first().catch(() => ({}));
      if ((me?.balance | 0) < total) return J({ ok: false, error: 'Insufficient balance.', need: total }, 402);
      const upd = await db.prepare('UPDATE users SET balance=balance-? WHERE id=? AND balance>=?').bind(total, myId, total).run();
      if ((upd?.meta?.changes | 0) === 0) return J({ ok: false, error: 'Insufficient balance.', need: total }, 402);
    }
    const keys = [];
    if (amount === 1 && custom) {
      try { await db.prepare('INSERT INTO api_keys (key_value,duration,device_limit,panel_code,created_by,server_type) VALUES (?,?,?,?,?,?)').bind(custom, dur, limit, myPanel, myId, server).run(); keys.push(custom); }
      catch { return J({ ok: false, error: 'Duplicate key.' }, 409); }
    } else {
      const seen = new Set();
      for (let i = 0; i < amount; i++) {
        let kv; let tries = 0;
        do { kv = dur + '-' + arcxRand(12); tries += 1; } while (seen.has(kv) && tries < 5);
        seen.add(kv);
        try { await db.prepare('INSERT INTO api_keys (key_value,duration,device_limit,panel_code,created_by,server_type) VALUES (?,?,?,?,?,?)').bind(kv, dur, limit, myPanel, myId, server).run(); keys.push(kv); }
        catch { /* collision: skip, counted below */ }
      }
      if (!keys.length) return J({ ok: false, error: 'Generation failed, retry.' }, 500);
    }
    return J({ ok: true, keys, duration: dur, device_limit: limit, charged: isOwnerLike ? 0 : total });
  }

  if (path === '/api/pricing') {
    return J({ ok: true, pricing: KEY_PRICING, durations: KEY_DURATIONS });
  }

  // ---- users ----------------------------------------------------------------------
  if (path === '/api/users' && method === 'GET') {
    if (!isOA) return J({ ok: false, error: 'Forbidden.' }, 403);
    let list;
    if (isOwnerLike) {
      list = (await db.prepare("SELECT u.*,(SELECT username FROM users WHERE id=u.invited_by) invited FROM users u WHERE u.panel_code=? ORDER BY u.id DESC LIMIT 200").bind(myPanel).all().catch(() => ({ results: [] }))).results || [];
    } else {
      list = (await db.prepare("SELECT u.*,(SELECT username FROM users WHERE id=u.invited_by) invited FROM users u WHERE u.panel_code=? AND (u.id=? OR (u.role='RESELLER' AND u.invited_by=?)) ORDER BY u.id DESC").bind(myPanel, myId, myId).all().catch(() => ({ results: [] }))).results || [];
    }
    return J({ ok: true, items: list.map((u) => ({ id: u.id, username: u.username, full_name: u.full_name, role: u.role, balance: u.balance | 0, is_blocked: !!(u.is_blocked | 0), invited: u.invited || null, validity: u.validity || null, validity_ist: u.validity ? formatIST(u.validity) : null, last_login: u.last_login || null })) });
  }

  if (path === '/api/users' && method === 'POST') {
    if (!isOA) return J({ ok: false, error: 'Forbidden.' }, 403);
    const p = await readBody(request);
    const tid = parseInt(p.target_id, 10) || 0;
    const amt = Math.abs(parseInt(p.amount, 10) || 0);
    const t = tid ? await db.prepare('SELECT * FROM users WHERE id=? AND panel_code=?').bind(tid, myPanel).first().catch(() => null) : null;
    if (!t) return J({ ok: false, error: 'User not found.' }, 404);
    if (t.role === 'PROFESSOR' && !isProfessor(sess)) return J({ ok: false, error: 'Not allowed.' }, 403);
    const tIsOwnReseller = t && t.role === 'RESELLER' && (t.invited_by | 0) === myId;
    if (myRole === 'ADMIN' && (t.role === 'OWNER' || t.role === 'PROFESSOR' || (t.id !== myId && !tIsOwnReseller))) return J({ ok: false, error: 'Not allowed.' }, 403);
    if (p.action === 'toggle_block') {
      if (t.id === myId) return J({ ok: false, error: 'Cannot block self.' }, 400);
      await db.prepare('UPDATE users SET is_blocked=1-is_blocked WHERE id=?').bind(tid).run();
      return J({ ok: true, message: 'Block toggled.' });
    }
    if ((p.action === 'add_balance' || p.action === 'deduct_balance') && amt > 0) {
      await db.prepare(p.action === 'add_balance'
        ? 'UPDATE users SET balance=balance+? WHERE id=?'
        : 'UPDATE users SET balance=CASE WHEN balance-?<0 THEN 0 ELSE balance-? END WHERE id=?'
      ).bind(...(p.action === 'add_balance' ? [amt, tid] : [amt, amt, tid])).run();
      return J({ ok: true, message: 'Balance updated.' });
    }
    return J({ ok: false, error: 'Invalid action.' }, 400);
  }

  // ---- referral ---------------------------------------------------------------------
  if (path === '/api/referral' && method === 'GET') {
    if (!isOA) return J({ ok: false, error: 'Forbidden.' }, 403);
    const list = isOwnerLike
      ? (await db.prepare('SELECT * FROM referrals WHERE panel_code=? ORDER BY rowid DESC LIMIT 200').bind(myPanel).all().catch(() => ({ results: [] }))).results || []
      : (await db.prepare('SELECT * FROM referrals WHERE created_by=? ORDER BY rowid DESC LIMIT 200').bind(myId).all().catch(() => ({ results: [] }))).results || [];
    return J({ ok: true, items: list });
  }

  if (path === '/api/referral' && method === 'POST') {
    if (!isOA) return J({ ok: false, error: 'Forbidden.' }, 403);
    const p = await readBody(request);
    if (p.action === 'generate') {
      // FIX: OWNER may only mint ADMIN/RESELLER (never OWNER/PROFESSOR via referral).
      const rr = String(p.role || 'RESELLER').toUpperCase();
      const role = isOwnerLike && ['ADMIN', 'RESELLER'].includes(rr) ? rr : 'RESELLER';
      const dur = Math.min(3650, Math.max(1, parseInt(p.duration, 10) || 30));
      const bal = Math.max(0, parseInt(p.balance, 10) || 0);
      if (!isOwnerLike) {
        const me = await db.prepare('SELECT can_generate_referral,referral_limit FROM users WHERE id=?').bind(myId).first().catch(() => ({}));
        if (!(me?.can_generate_referral | 0)) return J({ ok: false, error: 'Referral generation disabled.' }, 403);
        if ((me?.referral_limit | 0) > 0) {
          const c = await db.prepare('SELECT COUNT(*) c FROM referrals WHERE created_by=?').bind(myId).first().catch(() => ({ c: 99 }));
          if ((c?.c || 0) >= (me.referral_limit | 0)) return J({ ok: false, error: 'Referral limit reached.' }, 403);
        }
      }
      const rb = new Uint8Array(4); crypto.getRandomValues(rb);
      const code = 'REF-' + [...rb].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      await db.prepare('INSERT INTO referrals (code,role,duration,balance,panel_code,created_by) VALUES (?,?,?,?,?,?)').bind(code, role, dur, bal, myPanel, myId).run();
      return J({ ok: true, code, role, duration: dur, balance: bal });
    }
    if (p.action === 'delete_ref' && p.del_code) {
      if (isOwnerLike) await db.prepare('DELETE FROM referrals WHERE code=? AND panel_code=?').bind(String(p.del_code), myPanel).run();
      else await db.prepare('DELETE FROM referrals WHERE code=? AND created_by=?').bind(String(p.del_code), myId).run();
      return J({ ok: true });
    }
    return J({ ok: false, error: 'Invalid action.' }, 400);
  }

  // ---- server -------------------------------------------------------------------------
  if (path === '/api/server' && method === 'GET') {
    if (!isOA) return J({ ok: false, error: 'Forbidden.' }, 403);
    const s = await db.prepare('SELECT setting_name,setting_value FROM mod_settings WHERE panel_code=?').bind(myPanel).all()
      .then((r) => Object.fromEntries((r.results || []).map((x) => [x.setting_name, x.setting_value]))).catch(() => ({}));
    const m = await db.prepare('SELECT * FROM mod_maintenance WHERE panel_code=?').bind(myPanel).first().catch(() => null);
    return J({ ok: true, settings: s, maintenance: { on: m ? !!(m.is_active | 0) : false, reason: m?.reason || '' } });
  }

  if (path === '/api/server' && method === 'POST') {
    if (!isOA) return J({ ok: false, error: 'Forbidden.' }, 403);
    const p = await readBody(request);
    const MOD_FIELDS = ['modname', 'mod_status', 'credit', 'license_key', 'ESP', 'Item', 'AIM', 'SilentAim', 'BulletTrack', 'Floating', 'Memory', 'Setting'];
    const on = p.maintenance_mode != null ? (p.maintenance_mode ? 1 : 0) : (p.maintenance_on ? 1 : 0);
    await db.prepare('INSERT INTO mod_maintenance (panel_code,is_active,reason) VALUES (?,?,?) ON CONFLICT(panel_code) DO UPDATE SET is_active=excluded.is_active,reason=excluded.reason')
      .bind(myPanel, on, cleanStr(p.maintenance_reason, 255)).run();
    for (const k of MOD_FIELDS) {
      if (p[k] === undefined && !['ESP', 'Item', 'AIM', 'SilentAim', 'BulletTrack', 'Floating', 'Memory', 'Setting'].includes(k)) continue;
      const v = ['ESP', 'Item', 'AIM', 'SilentAim', 'BulletTrack', 'Floating', 'Memory', 'Setting'].includes(k)
        ? (p[k] ? 'on' : 'off')
        : cleanStr(p[k], 255);
      await db.prepare('INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES (?,?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value').bind(k, v, myPanel).run();
    }
    return J({ ok: true, message: 'Server config saved.' });
  }

  // ---- password change ------------------------------------------------------------------
  if (path === '/api/settings/password' && method === 'POST') {
    const p = await readBody(request);
    const me = await db.prepare('SELECT password_hash FROM users WHERE id=?').bind(myId).first().catch(() => null);
    if (!me || !(await verifyPassword(String(p.current_password || ''), me.password_hash))) return J({ ok: false, error: 'Current password is wrong.' }, 400);
    if (String(p.new_password || '').length < 4) return J({ ok: false, error: 'New password min 4 chars.' }, 400);
    const { hashPassword } = await import('./crypto.js');
    await db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(String(p.new_password)), myId).run();
    return J({ ok: true, message: 'Password updated.' });
  }

  // ---- AES status (no secrets leave the server) ------------------------------------
  // The Next.js /enc-api page uses this: booleans + expiry only. Key/IV values
  // are NEVER returned. Rotation stays on the HTML /aes route (main owner).
  if (path === '/api/aes-status' && method === 'GET') {
    if (!(myRole === 'OWNER' || myRole === 'PROFESSOR')) return J({ ok: false, error: 'Forbidden.' }, 403);
    const rows = await db.prepare("SELECT setting_name FROM mod_settings WHERE panel_code=? AND setting_name IN ('aes_key','aes_iv')").bind(myPanel).all()
      .then((r) => (r.results || []).map((x) => x.setting_name)).catch(() => []);
    const me = await db.prepare('SELECT panel_expiry FROM users WHERE id=?').bind(myId).first().catch(() => ({}));
    return J({ ok: true, configured: rows.includes('aes_key') && rows.includes('aes_iv'), expiry: me?.panel_expiry || null, expiry_ist: me?.panel_expiry ? formatIST(me.panel_expiry) : null });
  }

  // ---- panel activation (redeem voucher for your own panel) ---------------------------
  if (path === '/api/activate' && method === 'POST') {
    const p = await readBody(request);
    const k = cleanStr(p.activation_key, 64).toUpperCase();
    if (!k) return J({ ok: false, error: 'Activation key required.' }, 400);
    const row = await db.prepare('SELECT * FROM activation_keys WHERE activation_key=? AND is_used=0').bind(k).first().catch(() => null);
    if (!row) return J({ ok: false, error: 'Invalid or used key.' }, 404);
    await db.prepare("UPDATE activation_keys SET is_used=1,used_by=?,used_at=datetime('now') WHERE activation_key=?").bind(myPanel, k).run();
    await db.prepare('UPDATE users SET panel_expiry=? WHERE panel_code=?').bind(row.expires_at, myPanel).run();
    return J({ ok: true, message: 'Panel activated.', expires_at: row.expires_at, expires_at_ist: formatIST(row.expires_at) });
  }

  // ---- anticrack status (device binding + lib-hash posture, no secret values) -----------
  if (path === '/api/anticrack' && method === 'GET') {
    if (!isOA) return J({ ok: false, error: 'Forbidden.' }, 403);
    const main = env.PANEL_CODE || 'YUVI_001';
    const canSeeSdk = myId === 1 || isProfessor(sess);
    const hashScope = canSeeSdk ? main : myPanel;
    const hashes = await db.prepare('SELECT engine, COUNT(*) c, SUM(is_active) a FROM sdk_hash_vault WHERE panel_code=? GROUP BY engine').bind(hashScope).all()
      .then((r) => r.results || []).catch(() => []);
    const bound = await db.prepare('SELECT COUNT(*) c FROM key_devices WHERE panel_code=?').bind(myPanel).first().catch(() => ({}));
    return J({
      ok: true,
      device_binding: { bound_devices: bound?.c || 0, note: 'Keys are bound to device UUIDs (serial) with per-key device limits enforced in /connect.' },
      device_lock: { enabled: true, note: 'Panel logins are locked to a device fingerprint (24h reset cooldown).' },
      lib_hashes: hashes.map((h) => ({ engine: h.engine, total: h.c || 0, active: h.a || 0 })),
      sdk_scope: canSeeSdk ? hashScope : null,
    });
  }
  // ---- decrypt preview: tester runs the REAL endpoint, server decrypts --------
  // Same /connect + /encrypt handlers, same fresh D1 AES read. AES key/IV
  // NEVER leave the server; only the already-client-visible payload content
  // is returned, and only to OA roles testing their own panel.
  if (path === '/api/test-decrypt' && method === 'POST') {
    if (!isOA) return J({ ok: false, error: 'Forbidden.' }, 403);
    const p = await readBody(request);
    const userKey = cleanStr(p.user_key, 50), serial = cleanStr(p.serial, 100);
    const ep = String(p.endpoint || 'encrypt').toLowerCase() === 'connect' ? 'connect' : 'encrypt';
    if (!userKey || !serial) return J({ ok: false, error: 'user_key and serial required.' }, 400);
    const { handleConnect: hc, handleEncrypt: he } = await import('./p-connect.js');
    const fd = new FormData();
    fd.set('game', 'PUBG');
    fd.set('user_key', userKey);
    fd.set('serial', serial);
    const sub = new Request('https://internal/' + ep + '/' + myPanel, { method: 'POST', body: fd });
    const res = ep === 'connect' ? await hc(sub, db, myPanel, env) : await he(sub, db, myPanel, env);
    const http = res.status;
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    let decrypted = null;
    if (ep === 'encrypt' && parsed && parsed.status === true && typeof parsed.payload === 'string') {
      const s2 = await db.prepare("SELECT setting_name,setting_value FROM mod_settings WHERE panel_code=? AND setting_name IN ('aes_key','aes_iv')").bind(myPanel).all()
        .then((r) => Object.fromEntries((r.results || []).map((x) => [x.setting_name, x.setting_value]))).catch(() => ({}));
      try {
        const d = createDecipheriv('aes-256-cbc', Buffer.from(s2.aes_key, 'hex'), Buffer.from(s2.aes_iv, 'hex'));
        decrypted = JSON.parse(Buffer.concat([d.update(parsed.payload, 'base64'), d.final()]).toString('utf8'));
      } catch {
        decrypted = { error: 'decrypt failed (keys rotated mid-test?)' };
      }
    }
    return J({ ok: true, http, raw: parsed || text, decrypted });
  }

  // ---- panels (tenant mgmt; super-admin / professor only) -----------------------------------
  if (path === '/api/panels' && method === 'GET') {
    if (!(myId === 1 || isProfessor(sess))) return J({ ok: false, error: 'Forbidden.' }, 403);
    const list = (await db.prepare('SELECT p.*,(SELECT COUNT(*) FROM users WHERE panel_code=p.panel_code) total_users,(SELECT COUNT(*) FROM api_keys WHERE panel_code=p.panel_code) total_keys FROM panels p ORDER BY p.panel_code').all().catch(() => ({ results: [] }))).results || [];
    return J({ ok: true, items: list });
  }

  if (path === '/api/panels' && method === 'POST') {
    if (!(myId === 1 || isProfessor(sess))) return J({ ok: false, error: 'Forbidden.' }, 403);
    const p = await readBody(request);
    if (p.action === 'create') {
      let code = cleanPanelCode(p.custom_code || p.panel_code);
      if (!code) { const rb = new Uint8Array(3); crypto.getRandomValues(rb); code = 'PNL' + [...rb].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase(); }
      const dur = Math.min(3650, Math.max(1, parseInt(p.duration, 10) || 30));
      if (await db.prepare('SELECT panel_code FROM panels WHERE panel_code=?').bind(code).first().catch(() => null)) return J({ ok: false, error: 'Panel code exists.' }, 409);
      const exp = new Date(Date.now() + dur * 864e5).toISOString().slice(0, 19).replace('T', ' ');
      await db.prepare('INSERT INTO panels (panel_code,duration,expires_at,is_active) VALUES (?,?,?,1)').bind(code, dur, exp).run();
      return J({ ok: true, panel_code: code });
    }
    if (p.action === 'toggle_status' && p.target_panel) {
      const t = cleanPanelCode(p.target_panel);
      if (!t) return J({ ok: false, error: 'Invalid panel.' }, 400);
      await db.prepare('UPDATE panels SET is_active=1-is_active WHERE panel_code=?').bind(t).run();
      return J({ ok: true });
    }
    return J({ ok: false, error: 'Invalid action.' }, 400);
  }

  return J({ ok: false, error: 'NOT_FOUND' }, 404);
}

export { KEY_PRICING, KEY_DURATIONS };
