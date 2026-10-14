// Small helper so (auth) form pages that POST to legacy Worker form routes
// share one base URL.
export const BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/+$/, '');
