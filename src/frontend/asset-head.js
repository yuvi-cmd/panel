import { ASSET_VERSION } from './generated-assets.js';

// Local stylesheets, served by the Worker. Keep the version query so a deploy
// that changes the CSS is picked up even though the response is immutable.
export function assetHead() {
  return '<link rel="stylesheet" href="/assets/tailwind.css?v=' + ASSET_VERSION + '">'
    + '<link rel="stylesheet" href="/assets/bootstrap-icons.css?v=' + ASSET_VERSION + '">';
}
