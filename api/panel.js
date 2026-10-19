// Vercel entry — SAME panel / SAME UI as the Cloudflare Worker build.
// DB is Cloudflare D1 reached over the REST API (Vercel has no D1 binding).
//
// Required env (Vercel → Project → Settings → Environment Variables):
//   CF_ACCOUNT_ID        Cloudflare account id
//   CF_D1_DATABASE_ID    D1 database id (wrangler.toml ka database_id)
//   CF_D1_API_TOKEN      API token with "D1 Edit" permission
//   PANEL_CODE           e.g. YUVI_001 (default YUVI_001)
//   PANEL_NAME           panel ka naam (optional)
//   FRONTEND_ORIGIN      CORS origin (optional)
//   BCORE_SECRET         SAME value as Worker (warna keys break)
//   MUNDO_SALT           SAME value as Worker
//   ARCX_TOKEN_SALT      SAME value as Worker
//   DEBUG_ERRORS         '1' = full error text (optional)

import router from '../src/backend/router.js';
import { d1RestDatabase } from '../src/backend/d1-rest.js';

let ENV = null;

function buildEnv() {
  const need = (k) => {
    const v = process.env[k];
    if (!v) throw new Error('Missing env: ' + k + ' (Vercel project settings me set karo)');
    return v;
  };
  return {
    DB: d1RestDatabase({
      accountId: need('CF_ACCOUNT_ID'),
      databaseId: need('CF_D1_DATABASE_ID'),
      token: need('CF_D1_API_TOKEN'),
    }),
    PANEL_CODE: process.env.PANEL_CODE || 'YUVI_001',
    PANEL_NAME: process.env.PANEL_NAME || '',
    FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || '',
    BCORE_SECRET: process.env.BCORE_SECRET || '',
    MUNDO_SALT: process.env.MUNDO_SALT || '',
    ARCX_TOKEN_SALT: process.env.ARCX_TOKEN_SALT || '',
    DEBUG_ERRORS: process.env.DEBUG_ERRORS || '',
  };
}

function first(v) { return Array.isArray(v) ? v[0] : (v || ''); }

export default async function handler(req, res) {
  try {
    if (!ENV) ENV = buildEnv();

    const proto = String(first(req.headers['x-forwarded-proto'])).split(',')[0].trim() || 'https';
    const host = first(req.headers['x-forwarded-host']) || first(req.headers.host) || 'localhost';
    const method = (req.method || 'GET').toUpperCase();

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) { for (const x of v) headers.append(k, String(x)); }
      else headers.set(k, String(v));
    }

    let body;
    if (method !== 'GET' && method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      if (chunks.length) body = Buffer.concat(chunks);
    }

    const response = await router.fetch(
      new Request(proto + '://' + host + (req.url || '/'), { method, headers, body }),
      ENV,
      {},
    );

    res.statusCode = response.status;
    const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const [k, v] of response.headers) {
      if (k.toLowerCase() === 'set-cookie') continue;
      res.setHeader(k, v);
    }
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('SERVER ERROR: ' + (err && err.message ? err.message : String(err)));
  }
}
