// Entry point — Cloudflare Worker (module syntax).
// The existing SDK Panel router remains the main application. MAK/1 protocol
// endpoints and the MAK admin pages are mounted alongside it.

import router from './backend/router.js';
import { ensureDB } from './backend/db.js';
import { handleMakV2 } from './mak/protocol-v2.js';
import { json } from './mak/http.js';
import { PROTOCOL_V2, nowS, randomId } from './mak/crypto.js';

const BUILD = '2026-11-23.7';

function makFailure(error) {
  console.error('mak_request_failed', String(error && error.stack ? error.stack : error));
  return json({
    protocol: PROTOCOL_V2,
    decision: 'DENY',
    code: 'SERVER_ERROR',
    request_id: randomId('REQ', 12),
    message: 'Activation service unavailable',
    server_time: nowS(),
  }, 503, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Deployment probe. Never touches D1, so it also works while the database
    // is misconfigured or during a first deploy.
    if (url.pathname === '/healthz') {
      return json({
        ok: true,
        build: BUILD,
        mode: 'sdk-panel+mak',
        db_bound: !!env.DB,
        server_time: nowS(),
      }, 200, { 'Access-Control-Allow-Origin': '*' });
    }

    // MAK/2 is the only public protocol. MAK/1 endpoints were removed.
    // Every management screen lives inside the SDK Panel under /sdk.
    if (url.pathname === '/mak/v2' || url.pathname.startsWith('/mak/v2/')) {
      const db = env.DB;
      if (!db) return new Response('Database binding DB is not configured.', { status: 500 });
      try {
        await ensureDB(db, env.PANEL_CODE || 'YUVI_001');
        return await handleMakV2(request, env, db);
      } catch (error) {
        return makFailure(error);
      }
    }

    // Removed MAK/1 base: answer explicitly so old clients fail closed.
    if (url.pathname === '/mak/v1' || url.pathname.startsWith('/mak/v1/')) {
      return json({
        protocol: PROTOCOL_V2,
        decision: 'DENY',
        code: 'PROTOCOL_REMOVED',
        message: 'MAK/1 was removed. Use MAK/2.',
        server_time: nowS(),
      }, 410, { 'Access-Control-Allow-Origin': '*' });
    }

    if (url.pathname === '/mak' || url.pathname.startsWith('/mak/')) {
      const p = url.pathname.replace(/\/+$/, '') || '/mak';
      const rest = p === '/mak' ? '' : p.slice('/mak'.length);
      let target = '/sdk';
      if (rest === '/logout') target = '/logout';
      else if (rest === '/dashboard') target = '/sdk';
      else if (rest === '/licenses' || rest === '/licenses/new') target = rest === '/licenses/new' ? '/sdk/generate' : '/sdk/keys';
      else if (rest.startsWith('/licenses/')) target = '/sdk/keys' + rest.slice('/licenses'.length);
      else if (rest === '/guests' || rest.startsWith('/guests/')) target = '/sdk' + rest;
      else if (rest === '/hosts' || rest.startsWith('/hosts/')) target = '/sdk' + rest;
      else if (rest === '/devices' || rest.startsWith('/devices/')) target = '/sdk' + rest;
      else if (rest === '/sessions' || rest.startsWith('/sessions/')) target = '/sdk' + rest;
      else if (rest === '/logs' || rest.startsWith('/logs/')) target = '/sdk' + rest;
      else if (rest === '/settings' || rest.startsWith('/settings/')) target = '/sdk' + rest;
      if (url.pathname === '/mak/favicon.ico') return new Response(null, { status: 204 });
      // Preserve the HTTP method for legacy form posts (settings, license
      // actions, guest binding) so old bookmarks keep working until the client
      // is upgraded, then send browsers to the SDK page with a normal 302.
      const status = request.method === 'GET' || request.method === 'HEAD' ? 302 : 308;
      return new Response(null, { status, headers: { Location: target + url.search, 'Cache-Control': 'no-store' } });
    }

    return router.fetch(request, env, ctx);
  },
};
