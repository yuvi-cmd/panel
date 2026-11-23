// Cloudflare Worker entrypoint. Any unexpected failure on a MAK/1 endpoint is
// an unsigned, fail-closed denial; panel failures are plain 500 responses.

import { PROTOCOL, nowS, randomId } from './backend/crypto.js';
import { SECURITY_HEADERS, json, text } from './backend/http.js';
import { handleRequest } from './backend/router.js';

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      console.error('mak_request_failed', String(err && err.stack ? err.stack : err));
      const path = new URL(request.url).pathname;
      if (path === '/mak/v1' || path.startsWith('/mak/v1/')) {
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
      return text('Internal server error', 500, SECURITY_HEADERS);
    }
  },
};
