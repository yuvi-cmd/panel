// Entry point — Cloudflare Worker (module syntax).
// Backend (router / APIs / DB / crypto) lives in src/backend,
// frontend page renderers live in src/frontend.
// wrangler.toml main stays "src/index.js".
import router from './backend/router.js';

export default router;
