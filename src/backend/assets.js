// Static assets bundled with the Worker.
//
// Tailwind and Bootstrap Icons used to come from public CDNs. The strict CSP
// (script-src/style-src 'self') blocked both, so the panel rendered as raw
// HTML on mobile. These routes keep the same strict CSP and remove the
// external dependency entirely.

import {
  ASSET_VERSION,
  BOOTSTRAP_ICONS_CSS,
  BOOTSTRAP_ICONS_WOFF2_B64,
  TAILWIND_BASE_CSS,
  TAILWIND_UTILITIES_CSS,
} from '../frontend/generated-assets.js';

export { ASSET_VERSION };

const CACHE = 'public, max-age=31536000, immutable';

const FONT_BYTES = (() => {
  const bin = atob(BOOTSTRAP_ICONS_WOFF2_B64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
})();

function asset(body, type) {
  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': CACHE,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// Returns a response for /assets/* or null when the path is not an asset.
export function assetResponse(path) {
  if (path === '/assets/tailwind-base.css') return asset(TAILWIND_BASE_CSS, 'text/css; charset=utf-8');
  if (path === '/assets/tailwind-utilities.css') return asset(TAILWIND_UTILITIES_CSS, 'text/css; charset=utf-8');
  // Kept for pages cached from the previous single-file build.
  if (path === '/assets/tailwind.css') return asset(TAILWIND_BASE_CSS + TAILWIND_UTILITIES_CSS, 'text/css; charset=utf-8');
  if (path === '/assets/bootstrap-icons.css') return asset(BOOTSTRAP_ICONS_CSS, 'text/css; charset=utf-8');
  if (path === '/assets/bootstrap-icons.woff2') return asset(FONT_BYTES, 'font/woff2');
  return null;
}
