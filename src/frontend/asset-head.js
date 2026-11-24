import { ASSET_VERSION } from './generated-assets.js';

// Local stylesheets, served by the Worker. Keep the version query so a deploy
// that changes the CSS is picked up even though the response is immutable.
//
// Base (preflight + components) loads first so the panel's own component CSS
// can override it. Utilities load last (assetTail) so classes such as
// `absolute` and `sticky` win over `.glass-sidebar` / `.glass-header`.
export function assetHead() {
  return '<link rel="stylesheet" href="/assets/tailwind-base.css?v=' + ASSET_VERSION + '">'
    + '<link rel="stylesheet" href="/assets/bootstrap-icons.css?v=' + ASSET_VERSION + '">';
}

export function assetTail() {
  return '<link rel="stylesheet" href="/assets/tailwind-utilities.css?v=' + ASSET_VERSION + '">';
}
