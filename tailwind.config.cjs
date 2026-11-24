/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.js'],
  // Classes assembled at runtime (colour names are variables, so the
  // scanner cannot see the final class). Keep this list in sync with the
  // few dynamic builders in src/frontend/panel-ui.js and sdk/dash.js.
  safelist: [
    'text-emerald-500',
    'text-blue-500',
    'text-amber-500',
    'text-emerald-700',
    'text-amber-700',
    'text-red-700',
  ],
  theme: { extend: {} },
  plugins: [],
};
