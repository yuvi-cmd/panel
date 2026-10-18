// Shared security / tenant-isolation helpers for the Worker.
// Storage timestamps stay UTC ("YYYY-MM-DD HH:MM:SS" via datetime('now')).
// Display conversion to Asia/Kolkata (IST) happens in formatIST() / frontend.

export const ROLES = ['PROFESSOR', 'OWNER', 'ADMIN', 'RESELLER'];
const RANK = { PROFESSOR: 4, OWNER: 3, ADMIN: 2, RESELLER: 1 };

export function roleRank(r) {
  return RANK[String(r || '').toUpperCase()] || 0;
}

export function isProfessor(sess) {
  return String(sess?.role || '').toUpperCase() === 'PROFESSOR';
}

// Professor: global access as explicitly authorized. Phase-1 semantics:
// - scoped to their own panel like OWNER for tenant data,
// - plus access to SDK routes and tenant (panel) management.
// Tenant rows are still always scoped by the session's panel_code unless the
// caller is Professor AND explicitly passes an authorized target panel that
// the backend validates (see resolvePanel()).
export function resolvePanel(sess, mainPanel, requested) {
  const own = sess?.panel_code || mainPanel;
  if (isProfessor(sess) && typeof requested === 'string' && requested.trim()) {
    const pc = requested.toUpperCase().replace(/\s+/g, '').slice(0, 20);
    if (/^[A-Z0-9_]{1,20}$/.test(pc)) return pc;
  }
  return own;
}

export async function assertPanelActive(db, panelCode) {
  const prow = await db
    .prepare('SELECT panel_code FROM panels WHERE panel_code=? AND is_active=1')
    .bind(panelCode)
    .first()
    .catch(() => null);
  return !!prow;
}

// ---- rate limiting (best-effort, per-isolate memory) -----------------------
// NOTE: Cloudflare may run many isolates; this is NOT a global limiter.
// For production also enable Cloudflare Rate Limiting / Turnstile.
const buckets = new Map();
export function hitRate(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  b.n += 1;
  if (b.n > limit) return { allowed: false, remaining: 0, retryAfter: Math.ceil((b.reset - now) / 1000) };
  return { allowed: true, remaining: limit - b.n };
}

export function clientIp(req) {
  return (
    req.headers.get('CF-Connecting-IP') ||
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

// ---- time -----------------------------------------------------------------
// Parse the UTC "YYYY-MM-DD HH:MM:SS" format used across this DB.
export function tsMs(s) {
  const t = Date.parse(String(s || '').replace(' ', 'T') + 'Z');
  return isNaN(t) ? 0 : t;
}

// Format a stored UTC timestamp for display in Asia/Kolkata (IST).
// Returns '' for empty/invalid input. Never throws.
export function formatIST(s) {
  const ms = tsMs(s);
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(ms));
  } catch {
    return String(s || '');
  }
}

// ---- cookies ---------------------------------------------------------------
export function parseCookies(req) {
  const m = {};
  (req.headers.get('Cookie') || '').split(';').forEach((x) => {
    const i = x.indexOf('=');
    if (i > 0) m[x.slice(0, i).trim()] = decodeURIComponent(x.slice(i + 1).trim());
  });
  return m;
}

export function sessionCookie(token, req) {
  const https = (req?.url || '').startsWith('https://');
  return (
    'sdk_session=' +
    encodeURIComponent(token) +
    '; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax' +
    (https ? '; Secure' : '')
  );
}

export function clearSessionCookie() {
  return 'sdk_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax';
}

// ---- CORS for cross-origin frontends -------------------------------------
export function apiCors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = typeof env?.FRONTEND_ORIGIN === 'string' ? env.FRONTEND_ORIGIN.trim() : '';
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
  if (allowed && (allowed === '*' || origin === allowed)) {
    headers['Access-Control-Allow-Origin'] = allowed === '*' ? '*' : origin;
    if (allowed !== '*') headers['Access-Control-Allow-Credentials'] = 'true';
  } else if (!allowed) {
    // No frontend configured: allow same-origin tooling; browsers without
    // Origin header are unaffected. Explicit cross-origin calls need
    // FRONTEND_ORIGIN to be set.
  }
  return headers;
}

export function json(data, status = 200, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store', ...(extraHeaders || {}) },
  });
}

// ---- validation --------------------------------------------------------------
export function cleanStr(v, max = 255) {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && s.length <= max ? s : '';
}

export function cleanPanelCode(v) {
  const s = String(v || '').toUpperCase().replace(/\s+/g, '').slice(0, 20);
  return /^[A-Z0-9_]{1,20}$/.test(s) ? s : '';
}
