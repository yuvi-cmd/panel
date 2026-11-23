// Shared HTTP helpers — response builders + request parsing for route handlers.

export function html(d, s = 200) { return new Response(d, { status: s, headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' } }); }

export function redir(p, c) { const h = { Location: p }; if (c) h['Set-Cookie'] = c; return new Response(null, { status: 302, headers: h }); }

export function parseCookies(req) { const m = {}; (req.headers.get('Cookie') || '').split(';').forEach(x => { const i = x.indexOf('='); if (i > 0) m[x.slice(0, i).trim()] = decodeURIComponent(x.slice(i + 1).trim()); }); return m; }

export const tsMs = s => { const t = Date.parse(String(s || '').replace(' ', 'T') + 'Z'); return isNaN(t) ? 0 : t; };

export async function formParams(req) {
  try {
    const ct = req.headers.get('Content-Type') || '';
    if (ct.includes('form') || ct.includes('multipart')) { const fd = await req.formData(); return Object.fromEntries(fd.entries()); }
    if (ct.includes('json')) return await req.json();
  } catch {}
  return {};
}

export const deny = () => new Response('Access Denied.', { status: 403 });
