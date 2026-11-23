// HTTP primitives: responses, cookies, forms, request metadata, formatting.

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
  ].join('; '),
};

export function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...extra,
    },
  });
}

export function html(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...extra,
    },
  });
}

export function text(body, status = 200, extra = {}) {
  return new Response(String(body), {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

export function redirect(location, status = 303) {
  return new Response(null, {
    status,
    headers: { Location: location, 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
  });
}

export function methodNotAllowed(allow = 'GET, POST') {
  return text('Method not allowed', 405, { Allow: allow });
}

export function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function serializeCookie(name, value, opts = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`];
  bits.push('Path=' + (opts.path || '/'));
  if (opts.maxAge != null) bits.push('Max-Age=' + Math.max(0, Math.floor(opts.maxAge)));
  if (opts.httpOnly !== false) bits.push('HttpOnly');
  bits.push('SameSite=' + (opts.sameSite || 'Strict'));
  if (opts.secure !== false) bits.push('Secure');
  return bits.join('; ');
}

export function clearCookie(name) {
  return serializeCookie(name, '', { maxAge: 0 });
}

export function isSecureRequest(request) {
  return new URL(request.url).protocol === 'https:';
}

export function clientIp(request) {
  return String(
    request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Real-IP')
    || (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim()
    || 'unknown',
  );
}

export function sameOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return false;
  if (origin) {
    try { return new URL(origin).host === url.host; } catch { return false; }
  }
  if (referer) {
    try { return new URL(referer).host === url.host; } catch { return false; }
  }
  return true;
}

const MAX_BODY = 96 * 1024;

export async function readBody(request) {
  const cl = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (Number.isFinite(cl) && cl > MAX_BODY) throw new Error('BODY_TOO_LARGE');
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new Error('BODY_TOO_LARGE');
  return raw;
}

export async function formParams(request) {
  const raw = await readBody(request);
  const out = {};
  const sp = new URLSearchParams(raw);
  for (const [k, v] of sp) out[k] = v;
  return out;
}

export async function formAll(request) {
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('multipart/form-data')) {
    const fd = await request.formData();
    const sp = new URLSearchParams();
    for (const [key, value] of fd) {
      if (typeof value === 'string') sp.append(key, value);
    }
    return sp;
  }
  const raw = await readBody(request);
  return new URLSearchParams(raw);
}

export async function jsonBody(request) {
  const raw = await readBody(request);
  if (!raw.trim()) return {};
  const body = JSON.parse(raw);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('JSON_OBJECT_REQUIRED');
  return body;
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function jsArg(value) {
  return JSON.stringify(String(value ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATETIME_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

export function fmtDate(seconds) {
  if (!seconds) return 'Never';
  return DATE_FMT.format(new Date(Number(seconds) * 1000));
}

export function fmtDateTime(seconds) {
  if (!seconds) return 'Never';
  return DATETIME_FMT.format(new Date(Number(seconds) * 1000)).replace('am', 'AM').replace('pm', 'PM') + ' IST';
}

export function relTime(seconds) {
  const n = Number(seconds) || 0;
  if (!n) return 'Never';
  const diff = Math.floor(Date.now() / 1000) - n;
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? 'ago' : 'from now';
  if (abs < 45) return diff >= 0 ? 'just now' : 'in a moment';
  if (abs < 3600) return `${Math.floor(abs / 60)}m ${suffix}`;
  if (abs < 86400) return `${Math.floor(abs / 3600)}h ${suffix}`;
  if (abs < 2592000) return `${Math.floor(abs / 86400)}d ${suffix}`;
  return fmtDate(n);
}

export function truncate(value, max = 48) {
  const s = String(value ?? '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function licenseEffectiveStatus(license, now = Math.floor(Date.now() / 1000)) {
  const status = String(license?.status || 'ACTIVE').toUpperCase();
  if (status === 'SUSPENDED') return 'SUSPENDED';
  if (status === 'REVOKED') return 'REVOKED';
  if (license?.expires_at && Number(license.expires_at) <= now) return 'EXPIRED';
  return 'ACTIVE';
}

export function safeNext(value) {
  const s = String(value || '');
  if (!s.startsWith('/') || s.startsWith('//')) return '';
  return s;
}

export function buildQuery(base, params = {}) {
  const url = new URL(base, 'https://local.invalid');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.pathname + (url.search || '');
}

export function flashRedirect(path, ok = '', err = '') {
  return redirect(buildQuery(path, { ok, err }));
}
