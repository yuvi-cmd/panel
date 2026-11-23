// Entry point — Cloudflare Worker (module syntax).
// The existing SDK Panel router remains the main application. MAK/1 protocol
// endpoints and the MAK admin pages are mounted alongside it.

import router from './backend/router.js';
import { ensureDB } from './backend/db.js';
import { handleMak } from './mak/protocol.js';
import { handleMakAdmin } from './mak/admin.js';
import { json } from './mak/http.js';
import { PROTOCOL, nowS, randomId } from './mak/crypto.js';

const BUILD = '2026-11-23.5';

function makFailure(error) {
  console.error('mak_request_failed', String(error && error.stack ? error.stack : error));
  return json({
    protocol: PROTOCOL,
    decision: 'DENY',
    code: 'SERVER_ERROR',
    request_id: randomId('REQ', 12),
    permissions: { install: false, launch: false, update: false, restart: false },
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

    if (url.pathname === '/mak' || url.pathname.startsWith('/mak/')) {
      const db = env.DB;
      if (!db) return new Response('Database binding DB is not configured.', { status: 500 });
      try {
        await ensureDB(db, env.PANEL_CODE || 'YUVI_001');
        if (url.pathname === '/mak/v1' || url.pathname.startsWith('/mak/v1/')) {
          return await handleMak(request, env, db);
        }
        return await handleMakAdmin(request, env, db);
      } catch (error) {
        if (url.pathname === '/mak/v1' || url.pathname.startsWith('/mak/v1/')) {
          return makFailure(error);
        }
        console.error('panel_request_failed', String(error && error.stack ? error.stack : error));
        return new Response('Internal server error', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
    }

    return router.fetch(request, env, ctx);
  },
};
