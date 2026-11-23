// Shared premium UI kit: icon set, full CSS design system, shell layout, JS.
// Server-rendered, zero external JS. Google Fonts only.

import { esc, fmtDate, fmtDateTime, relTime, licenseEffectiveStatus, truncate } from '../backend/http.js';

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2m-5 5 3 3m-6-1 3 3"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  apps: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  activity: '<path d="M3 12h4l2.5-7 4 14L16 12h5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.15.36.37.7.6 1 .3.3.7.45 1.1.45H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  refresh: '<path d="M20 11a8.1 8.1 0 0 0-15-5l-2 2m0-5v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15 5l2-2m0 5v-5h-5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/>',
  external: '<path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
  fingerprint: '<path d="M12 10a2 2 0 0 0-2 2c0 2.5-.5 4.5-1.5 6.5"/><path d="M8.5 5.5A7 7 0 0 1 19 12c0 2-.2 3.7-.7 5.5"/><path d="M5 8.5A7 7 0 0 0 12 19c1.4 0 2.4-.4 3.3-1"/><path d="M12 6a6 6 0 0 1 6 6c0 1.8-.2 3.3-.6 5"/><path d="M9 12a3 3 0 0 1 6 0c0 2.3-.2 4.3-.8 6"/>',
  pulse: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  'arrow-right': '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 21h16"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M3 3l18 18M10.6 10.6A3 3 0 0 0 13.4 13.4M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3M6.1 6.1A16.7 16.7 0 0 0 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.8-.8"/>',
  zap: '<path d="M13 2 3 14h8l-1 8 11-13h-8l0-7Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/>',
  'shield-alert': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 8v4M12 16h.01"/>',
  dot: '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
};

export function icon(name, size = 18, cls = '') {
  const body = ICONS[name] || ICONS.dot;
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function escAttr(v) { return esc(v); }

export function statusBadge(status) {
  const s = String(status || 'UNKNOWN').toUpperCase();
  const map = {
    ACTIVE: 'ok', ALLOW: 'ok', SUCCESS: 'ok', ONLINE: 'ok', ALIVE: 'ok', AUTHORIZED: 'ok',
    SUSPENDED: 'warn', PENDING: 'warn', EXPIRED: 'warn', INFO: 'warn',
    REVOKED: 'bad', DENY: 'bad', ERROR: 'bad', OFFLINE: 'bad', FAIL: 'bad',
  };
  return `<span class="badge ${map[s] || 'neutral'}"><span class="badge-dot"></span>${esc(s)}</span>`;
}

export function resultBadge(result) {
  const r = String(result || 'INFO').toUpperCase();
  const cls = r === 'ALLOW' || r === 'SUCCESS' ? 'ok' : r === 'DENY' || r === 'ERROR' ? 'bad' : 'info';
  return `<span class="badge ${cls}"><span class="badge-dot"></span>${esc(r)}</span>`;
}

export function flashHtml(ok, err) {
  if (!ok && !err) return '';
  const isErr = !!err;
  return `<div class="alert ${isErr ? 'alert-bad' : 'alert-ok'}" role="status">
    <span class="alert-ic">${icon(isErr ? 'alert' : 'check', 18)}</span>
    <div class="alert-body">${esc(isErr ? err : ok)}</div>
    <button type="button" class="alert-x" onclick="this.parentElement.remove()" aria-label="Dismiss">${icon('x', 15)}</button>
  </div>`;
}

export function pageHeader({ eyebrow = '', title, subtitle = '', actions = '' }) {
  return `<div class="page-head">
    <div class="page-head-copy">
      ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}
      <h1>${title}</h1>
      ${subtitle ? `<p>${subtitle}</p>` : ''}
    </div>
    ${actions ? `<div class="page-head-actions">${actions}</div>` : ''}
  </div>`;
}

export function sectionHead(title, subtitle = '', action = '') {
  return `<div class="section-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${action ? `<div class="section-action">${action}</div>` : ''}</div>`;
}

export function emptyState(iconName, title, text = '', action = '') {
  return `<div class="empty"><div class="empty-ic">${icon(iconName, 26)}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action ? `<div class="empty-action">${action}</div>` : ''}</div>`;
}

export function codeValue(id, value, opts = {}) {
  return `<div class="code-box ${opts.tall ? 'tall' : ''}">
    <code id="${esc(id)}">${esc(value)}</code>
    <button type="button" class="copy-btn" onclick="copyEl('${esc(id)}',this)" title="Copy">${icon('copy', 16)}<span>Copy</span></button>
  </div>`;
}

export function field(label, inputHtml, hint = '', cls = '') {
  return `<label class="field ${cls}"><span class="field-label">${esc(label)}</span>${inputHtml}${hint ? `<span class="field-hint">${hint}</span>` : ''}</label>`;
}

export function toggle(name, checked, label = '', desc = '') {
  return `<label class="toggle-row">
    <span class="toggle-copy">${label ? `<b>${esc(label)}</b>` : ''}${desc ? `<small>${esc(desc)}</small>` : ''}</span>
    <span class="switch"><input type="checkbox" name="${esc(name)}" value="1" ${checked ? 'checked' : ''}><span class="switch-track"></span><span class="switch-thumb"></span></span>
  </label>`;
}

export function segmented(basePath, current, options) {
  return `<div class="segmented">${options.map((o) => {
    const q = o.value ? `?status=${encodeURIComponent(o.value)}` : '';
    const active = String(current || 'ALL') === String(o.value || 'ALL');
    return `<a class="${active ? 'active' : ''}" href="${esc(basePath + q)}">${esc(o.label)}${o.count != null ? `<span>${o.count}</span>` : ''}</a>`;
  }).join('')}</div>`;
}

export function timeCell(seconds) {
  if (!seconds) return '<span class="muted">Never</span>';
  return `<span title="${esc(fmtDateTime(seconds))}">${esc(relTime(seconds))}</span>`;
}

export function licenseStatusBadge(license) {
  return statusBadge(licenseEffectiveStatus(license));
}

export function licenseHostText(license) {
  return license.host_package
    ? `<span class="mono small">${esc(license.host_package)}</span>`
    : `<span class="badge warn"><span class="badge-dot"></span>FIRST USE</span>`;
}

export function licenseExpiry(license) {
  if (!license.expires_at) return '<span class="muted">Never</span>';
  const now = Math.floor(Date.now() / 1000);
  const left = Number(license.expires_at) - now;
  const cls = left <= 0 ? 'muted' : left < 3 * 86400 ? 'text-warn' : '';
  return `<span class="${cls}" title="${esc(fmtDateTime(license.expires_at))}">${esc(fmtDate(license.expires_at))}</span>`;
}

export const CSS = `
:root{
  --bg:#07080d; --bg2:#0a0c14; --panel:rgba(17,20,31,.72); --panel-solid:#11141f;
  --panel2:rgba(23,27,41,.68); --line:rgba(148,163,184,.14); --line2:rgba(148,163,184,.22);
  --ink:#f4f6fb; --muted:#9aa4b8; --faint:#667085;
  --acc:#8b5cf6; --acc2:#22d3ee; --acc-soft:rgba(139,92,246,.14); --acc-line:rgba(139,92,246,.38);
  --ok:#34d399; --ok-soft:rgba(52,211,153,.12); --warn:#fbbf24; --warn-soft:rgba(251,191,36,.12);
  --bad:#fb7185; --bad-soft:rgba(251,113,133,.12); --info:#60a5fa; --info-soft:rgba(96,165,250,.12);
  --radius:18px; --radius-sm:12px; --shadow:0 24px 80px rgba(0,0,0,.38);
  --font:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
html[data-theme="light"]{
  --bg:#f5f6fb; --bg2:#eef1f8; --panel:rgba(255,255,255,.82); --panel-solid:#ffffff;
  --panel2:rgba(248,250,253,.9); --line:rgba(15,23,42,.09); --line2:rgba(15,23,42,.15);
  --ink:#0f172a; --muted:#5d6b82; --faint:#8591a5;
  --acc:#4F46E5; --acc2:#0891b2; --acc-soft:rgba(79,70,229,.09); --acc-line:rgba(79,70,229,.3);
  --ok:#059669; --ok-soft:rgba(5,150,105,.09); --warn:#b45309; --warn-soft:rgba(180,83,9,.1);
  --bad:#e11d48; --bad-soft:rgba(225,29,72,.08); --info:#2563eb; --info-soft:rgba(37,99,235,.08);
  --shadow:0 20px 60px rgba(15,23,42,.1);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font-family:var(--font);font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none}
button,input,select,textarea{font:inherit}
button{cursor:pointer}
.ic{display:inline-block;vertical-align:-3px;flex-shrink:0}
.mono{font-family:var(--mono);font-size:12.5px;letter-spacing:-.01em}
.small{font-size:12px}
.muted{color:var(--muted)}
.text-warn{color:var(--warn)}
.text-bad{color:var(--bad)}
.text-ok{color:var(--ok)}
.nowrap{white-space:nowrap}
.grow{flex:1;min-width:0}
.hide-mobile{display:initial}
.mobile-only{display:none!important}
::selection{background:rgba(139,92,246,.35)}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:rgba(148,163,184,.25);border-radius:999px;border:3px solid transparent;background-clip:content-box}

/* ambient */
.aurora{position:fixed;pointer-events:none;z-index:0;filter:blur(90px);opacity:.5;border-radius:50%}
.a1{width:620px;height:620px;left:-220px;top:-260px;background:radial-gradient(circle,rgba(139,92,246,.45),transparent 68%)}
.a2{width:540px;height:540px;right:-220px;top:80px;background:radial-gradient(circle,rgba(34,211,238,.2),transparent 68%)}
.a3{width:420px;height:420px;left:35%;bottom:-280px;background:radial-gradient(circle,rgba(236,72,153,.14),transparent 68%)}
html[data-theme="light"] .aurora{opacity:.35}

/* app shell */
.app{display:grid;grid-template-columns:268px minmax(0,1fr);min-height:100vh;position:relative;z-index:1}
.sidebar{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(14,16,25,.94),rgba(10,12,20,.9));border-right:1px solid var(--line);backdrop-filter:blur(22px);z-index:60}
html[data-theme="light"] .sidebar{background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(248,250,253,.9))}
html[data-theme="light"] .brand-mark{background:linear-gradient(135deg,#4F46E5,#4338CA);box-shadow:0 10px 28px rgba(79,70,229,.3),inset 0 1px 0 rgba(255,255,255,.35)}
.brand{display:flex;align-items:center;gap:12px;padding:22px 20px 18px}
.brand-mark{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#8b5cf6,#22d3ee);box-shadow:0 10px 28px rgba(139,92,246,.38),inset 0 1px 0 rgba(255,255,255,.35);position:relative;overflow:hidden}
.brand-mark::after{content:"";position:absolute;inset:1px;border-radius:13px;border:1px solid rgba(255,255,255,.28)}
.brand-text{display:flex;flex-direction:column;min-width:0}
.brand-text b{font-size:15px;font-weight:800;letter-spacing:.13em}
.brand-text small{font-size:9.5px;font-weight:700;letter-spacing:.18em;color:var(--muted);margin-top:2px}
.server-mini{margin:2px 14px 10px;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);display:flex;align-items:center;gap:10px;font-size:11.5px;font-weight:700;color:var(--muted)}
.server-mini .pulse-dot{width:8px;height:8px;border-radius:99px;flex-shrink:0}
.server-mini.on .pulse-dot{background:var(--ok);box-shadow:0 0 0 4px rgba(52,211,153,.12);animation:pulse 2.4s infinite}
.server-mini.off .pulse-dot{background:var(--bad);box-shadow:0 0 0 4px rgba(251,113,133,.12)}
.server-mini b{color:var(--ink);font-weight:800}
.nav{flex:1;overflow-y:auto;padding:4px 12px 12px}
.nav-label{font-size:9.5px;font-weight:800;letter-spacing:.18em;color:var(--faint);text-transform:uppercase;padding:18px 10px 8px}
.nav-item{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:12px;color:var(--muted);font-size:13px;font-weight:600;margin-bottom:2px;border:1px solid transparent;transition:.16s ease}
.nav-item:hover{color:var(--ink);background:rgba(148,163,184,.08)}
.nav-item.active{color:var(--ink);background:linear-gradient(90deg,rgba(139,92,246,.18),rgba(34,211,238,.05));border-color:rgba(139,92,246,.24);box-shadow:inset 3px 0 0 var(--acc)}
.nav-item .ic{opacity:.85}
.nav-item.active .ic{color:#c4b5fd;opacity:1}
html[data-theme="light"] .nav-item.active .ic{color:var(--acc)}
.nav-badge{margin-left:auto;font-size:10px;font-weight:800;background:var(--acc-soft);color:#c4b5fd;border:1px solid var(--acc-line);border-radius:99px;padding:1px 7px}
html[data-theme="light"] .nav-badge{color:var(--acc)}
.sidebar-foot{padding:12px 14px 16px;border-top:1px solid var(--line)}
.user-card{display:flex;align-items:center;gap:10px;padding:10px;border-radius:13px;background:var(--panel2);border:1px solid var(--line)}
.avatar{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-weight:800;font-size:13px;color:#fff;background:linear-gradient(135deg,#8b5cf6,#ec4899);box-shadow:inset 0 1px 0 rgba(255,255,255,.3);flex-shrink:0}
.user-card .who{flex:1;min-width:0}
.user-card .who b{display:block;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.user-card .who small{display:block;font-size:9.5px;letter-spacing:.12em;color:var(--muted);font-weight:700;margin-top:1px}
.logout-btn{width:30px;height:30px;border-radius:9px;border:1px solid var(--line);background:transparent;color:var(--muted);display:grid;place-items:center}
.logout-btn:hover{color:var(--bad);border-color:rgba(251,113,133,.35);background:var(--bad-soft)}
.build{display:flex;justify-content:space-between;gap:8px;font-size:9.5px;color:var(--faint);font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:12px 4px 0}

.main{min-width:0;display:flex;flex-direction:column}
.topbar{position:sticky;top:0;z-index:40;display:flex;align-items:center;gap:12px;padding:0 26px;height:72px;border-bottom:1px solid var(--line);background:rgba(8,10,16,.72);backdrop-filter:blur(20px)}
html[data-theme="light"] .topbar{background:rgba(255,255,255,.72)}
.topbar-title{min-width:0;display:flex;flex-direction:column;gap:1px}
.topbar-title .crumb{font-size:9.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--faint)}
.topbar-title strong{font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topbar-actions{margin-left:auto;display:flex;align-items:center;gap:9px}
.server-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:99px;font-size:10.5px;font-weight:800;letter-spacing:.04em;border:1px solid var(--line);color:var(--muted);background:var(--panel2);white-space:nowrap}
.server-pill::before{content:"";width:7px;height:7px;border-radius:99px;background:var(--bad);box-shadow:0 0 0 3px rgba(251,113,133,.12)}
.server-pill.on::before{background:var(--ok);box-shadow:0 0 0 3px rgba(52,211,153,.12);animation:pulse 2.4s infinite}
.icon-btn{width:38px;height:38px;border-radius:11px;border:1px solid var(--line);background:var(--panel2);color:var(--muted);display:inline-flex;align-items:center;justify-content:center;transition:.15s}
.icon-btn:hover{color:var(--ink);border-color:var(--line2);background:rgba(148,163,184,.1)}
.user-menu{position:relative}
.user-menu .avatar{cursor:pointer;width:38px;height:38px;border-radius:11px}
.user-menu-pop{position:absolute;right:0;top:calc(100% + 10px);width:190px;padding:6px;border-radius:13px;background:var(--panel-solid);border:1px solid var(--line2);box-shadow:var(--shadow);display:none;z-index:70}
.user-menu.open .user-menu-pop{display:block}
.user-menu-pop a,.user-menu-pop button{display:flex;align-items:center;gap:9px;width:100%;padding:9px 10px;border-radius:9px;border:0;background:transparent;color:var(--muted);font-size:12.5px;font-weight:700;text-align:left}
.user-menu-pop a:hover{background:rgba(148,163,184,.09);color:var(--ink)}
.user-menu-pop button{color:var(--bad)}
.user-menu-pop button:hover{background:var(--bad-soft)}

.content{flex:1;width:100%;max-width:1280px;margin:0 auto;padding:28px 28px 90px}
.page-head{display:flex;align-items:flex-end;gap:20px;justify-content:space-between;flex-wrap:wrap;margin-bottom:22px}
.page-head-copy{min-width:0}
.eyebrow{font-size:10px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:var(--acc2);margin-bottom:7px}
.page-head h1{font-size:28px;line-height:1.1;letter-spacing:-.035em;margin:0;font-weight:850}
.page-head p{margin:7px 0 0;color:var(--muted);font-size:13px;max-width:680px}
.page-head-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin:0 0 12px}
.section-head h2{font-size:15px;margin:0;letter-spacing:-.015em;font-weight:800}
.section-head p{font-size:11.5px;color:var(--muted);margin:3px 0 0}

/* buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:11px;border:1px solid var(--line2);background:var(--panel2);color:var(--ink);font-size:12.5px;font-weight:750;padding:10px 14px;transition:.16s ease;white-space:nowrap;line-height:1.2}
.btn:hover{background:rgba(148,163,184,.12);border-color:var(--line2);transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn-primary{background:linear-gradient(135deg,#8b5cf6,#6d28d9);border-color:rgba(139,92,246,.5);color:#fff;box-shadow:0 8px 24px rgba(139,92,246,.28)}
.btn-primary:hover{background:linear-gradient(135deg,#9f7aea,#7c3aed);box-shadow:0 12px 30px rgba(139,92,246,.36)}
.btn-cyan{background:linear-gradient(135deg,#0891b2,#0e7490);border-color:rgba(34,211,238,.35);color:#fff;box-shadow:0 8px 24px rgba(8,145,178,.25)}
.btn-danger{background:var(--bad-soft);border-color:rgba(251,113,133,.35);color:#fda4af}
.btn-danger:hover{background:rgba(251,113,133,.2);color:#fecdd3}
.btn-ghost{background:transparent;border-color:var(--line)}
.btn-sm{padding:7px 10px;font-size:11.5px;border-radius:9px;gap:6px}
.btn-icon{width:34px;height:34px;padding:0}
.btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
.link{color:#c4b5fd;font-weight:700}
.link:hover{text-decoration:underline}
html[data-theme="light"] .link{color:var(--acc)}

/* cards */
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 1px 0 rgba(255,255,255,.03) inset,0 12px 40px rgba(0,0,0,.12);backdrop-filter:blur(18px);padding:20px;min-width:0}
html[data-theme="light"] .card{box-shadow:0 12px 40px rgba(15,23,42,.06)}
.card.tight{padding:0;overflow:hidden}
.card-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
.card-hd h3{font-size:13.5px;margin:0;font-weight:800;letter-spacing:-.01em}
.card-hd p{font-size:11.5px;color:var(--muted);margin:3px 0 0}
.card-body{padding:20px}
.divider{height:1px;background:var(--line);margin:16px 0}
.grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.stack{display:flex;flex-direction:column;gap:14px}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.spread{display:flex;align-items:center;justify-content:space-between;gap:12px}

/* hero */
.hero{position:relative;overflow:hidden;border-radius:22px;border:1px solid rgba(139,92,246,.28);background:
  radial-gradient(900px 280px at 12% -20%,rgba(139,92,246,.35),transparent 62%),
  radial-gradient(600px 240px at 94% 10%,rgba(34,211,238,.2),transparent 60%),
  linear-gradient(120deg,rgba(20,22,36,.94),rgba(11,13,22,.92));
  box-shadow:0 24px 70px rgba(0,0,0,.3);padding:26px;margin-bottom:20px;isolation:isolate}
html[data-theme="light"] .hero{background:
  radial-gradient(900px 280px at 12% -20%,rgba(139,92,246,.22),transparent 62%),
  radial-gradient(600px 240px at 94% 10%,rgba(34,211,238,.15),transparent 60%),
  linear-gradient(120deg,rgba(255,255,255,.96),rgba(247,249,255,.96));box-shadow:0 24px 70px rgba(15,23,42,.1)}
.hero::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(148,163,184,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.06) 1px,transparent 1px);background-size:34px 34px;mask-image:linear-gradient(90deg,#000,transparent 80%);z-index:-1}
.hero::after{content:"";position:absolute;width:260px;height:260px;right:-70px;top:-120px;border-radius:50%;border:1px solid rgba(34,211,238,.2);box-shadow:0 0 0 40px rgba(34,211,238,.035),0 0 0 80px rgba(34,211,238,.025);z-index:-1}
.hero-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center}
.hero .hero-kicker{display:inline-flex;align-items:center;gap:7px;padding:5px 10px;border-radius:99px;border:1px solid rgba(34,211,238,.28);background:rgba(34,211,238,.08);color:#a5f3fc;font-size:9.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;margin-bottom:12px}
html[data-theme="light"] .hero .hero-kicker{color:#0e7490}
.hero h2{font-size:clamp(23px,3.4vw,34px);line-height:1.08;letter-spacing:-.04em;margin:0;font-weight:850;max-width:640px}
.hero h2 .grad{background:linear-gradient(100deg,#c4b5fd,#67e8f9);-webkit-background-clip:text;background-clip:text;color:transparent}
html[data-theme="light"] .hero h2 .grad{background:linear-gradient(100deg,#6d28d9,#0891b2);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{color:var(--muted);margin:10px 0 0;max-width:600px;font-size:13px}
.hero-meta{display:flex;gap:18px;flex-wrap:wrap;margin-top:18px}
.hero-meta div{font-size:10px;color:var(--faint);font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.hero-meta b{display:block;font-size:12.5px;color:var(--ink);letter-spacing:0;text-transform:none;font-weight:750;margin-top:2px}
.server-control{min-width:220px;padding:16px;border-radius:16px;border:1px solid var(--line2);background:rgba(8,10,16,.42);backdrop-filter:blur(12px)}
html[data-theme="light"] .server-control{background:rgba(255,255,255,.72)}
.server-control .sc-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.server-control .sc-label{font-size:9.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.server-control .sc-state{font-size:22px;font-weight:850;letter-spacing:-.03em;margin-top:2px}
.server-control .sc-state.on{color:var(--ok)}
.server-control .sc-state.off{color:var(--bad)}
.server-control .sc-note{font-size:11px;color:var(--muted);margin:7px 0 13px}
.server-control .btn{width:100%}

/* KPI */
.kpi{display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:16px;background:var(--panel);border:1px solid var(--line);position:relative;overflow:hidden;min-width:0}
.kpi::after{content:"";position:absolute;right:-40px;top:-50px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,var(--acc-soft),transparent 68%)}
.kpi-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.kpi-ic{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:var(--acc-soft);color:#c4b5fd;border:1px solid var(--acc-line)}
html[data-theme="light"] .kpi-ic{color:var(--acc)}
.kpi-ic.cyan{background:rgba(34,211,238,.1);color:#67e8f9;border-color:rgba(34,211,238,.25)}
html[data-theme="light"] .kpi-ic.cyan{color:#0e7490}
.kpi-ic.green{background:var(--ok-soft);color:var(--ok);border-color:rgba(52,211,153,.25)}
.kpi-ic.amber{background:var(--warn-soft);color:var(--warn);border-color:rgba(251,191,36,.25)}
.kpi-label{font-size:9.5px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:var(--faint)}
.kpi-value{font-size:30px;line-height:1;font-weight:850;letter-spacing:-.045em}
.kpi-foot{font-size:10.5px;color:var(--muted);display:flex;align-items:center;gap:5px}
.kpi-foot .up{color:var(--ok);font-weight:800}

/* tables */
.table-wrap{border:1px solid var(--line);border-radius:15px;overflow:auto;background:var(--panel);backdrop-filter:blur(16px)}
table.tbl{width:100%;border-collapse:collapse;min-width:760px}
.tbl th{text-align:left;padding:10px 14px;font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);background:rgba(148,163,184,.045);border-bottom:1px solid var(--line);white-space:nowrap}
.tbl td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:12.5px}
.tbl tr:last-child td{border-bottom:0}
.tbl tbody tr{transition:background .12s}
.tbl tbody tr:hover{background:rgba(148,163,184,.045)}
.tbl .cell-main{font-weight:750;color:var(--ink)}
.tbl .cell-sub{font-size:10.5px;color:var(--muted);margin-top:2px}
.tbl .actions{display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap}
.tbl .num{text-align:right}
.table-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}
.table-empty{padding:34px 16px;text-align:center;color:var(--muted)}

/* badges */
.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:99px;font-size:9.5px;font-weight:850;letter-spacing:.07em;white-space:nowrap;border:1px solid transparent;text-transform:uppercase}
.badge-dot{width:5px;height:5px;border-radius:99px;background:currentColor;box-shadow:0 0 8px currentColor}
.badge.ok{background:var(--ok-soft);color:var(--ok);border-color:rgba(52,211,153,.18)}
.badge.warn{background:var(--warn-soft);color:var(--warn);border-color:rgba(251,191,36,.18)}
.badge.bad{background:var(--bad-soft);color:var(--bad);border-color:rgba(251,113,133,.18)}
.badge.info{background:var(--info-soft);color:var(--info);border-color:rgba(96,165,250,.18)}
.badge.neutral{background:rgba(148,163,184,.1);color:var(--muted);border-color:var(--line)}
.chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:7px;font-size:10px;font-weight:800;background:rgba(148,163,184,.09);color:var(--muted);border:1px solid var(--line);white-space:nowrap}
.chip.acc{background:var(--acc-soft);color:#c4b5fd;border-color:var(--acc-line)}
html[data-theme="light"] .chip.acc{color:var(--acc)}
.chip.ok{background:var(--ok-soft);color:var(--ok);border-color:rgba(52,211,153,.18)}
.chip.bad{background:var(--bad-soft);color:var(--bad);border-color:rgba(251,113,133,.18)}

/* toolbar */
.toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.search{position:relative;flex:1;min-width:200px;max-width:380px}
.search .ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--faint)}
.search input{width:100%;padding:10px 12px 10px 37px;border-radius:11px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);outline:none;font-size:12.5px}
.search input:focus{border-color:var(--acc-line);box-shadow:0 0 0 3px var(--acc-soft)}
.search input::placeholder{color:var(--faint)}
.segmented{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:11px;border:1px solid var(--line);background:var(--panel2);max-width:100%;overflow-x:auto;scrollbar-width:none}
.segmented::-webkit-scrollbar{display:none}
.segmented a{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;color:var(--muted);font-size:11px;font-weight:750;white-space:nowrap}
.segmented a:hover{color:var(--ink)}
.segmented a.active{background:rgba(139,92,246,.16);color:#ddd6fe;box-shadow:inset 0 0 0 1px rgba(139,92,246,.22)}
html[data-theme="light"] .segmented a.active{color:var(--acc)}
.segmented a span{font-size:9.5px;background:rgba(148,163,184,.12);padding:1px 5px;border-radius:99px}
.segmented a.active span{background:rgba(139,92,246,.2)}

/* forms */
.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.form-grid .span-2{grid-column:span 2}
.field{display:flex;flex-direction:column;gap:6px;min-width:0}
.field-label{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.field-hint{font-size:10.5px;color:var(--faint);line-height:1.4}
.input,input[type=text],input[type=password],input[type=date],input[type=number],select,textarea{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:rgba(8,10,16,.35);color:var(--ink);outline:none;font-size:12.5px;transition:.15s}
html[data-theme="light"] .input,html[data-theme="light"] input,html[data-theme="light"] select,html[data-theme="light"] textarea{background:#fff}
.input:focus,input:focus,select:focus,textarea:focus{border-color:var(--acc-line);box-shadow:0 0 0 3px var(--acc-soft)}
textarea{min-height:80px;resize:vertical}
select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239aa4b8' stroke-width='2.2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 11px center;padding-right:32px}
input::placeholder,textarea::placeholder{color:var(--faint)}
input[type=checkbox]{accent-color:var(--acc);width:15px;height:15px}
.form-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
.toggle-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--panel2)}
.toggle-copy b{display:block;font-size:12px;font-weight:750}
.toggle-copy small{display:block;font-size:10.5px;color:var(--muted);margin-top:2px}
.switch{position:relative;width:44px;height:24px;flex-shrink:0;display:inline-block}
.switch input{position:absolute;opacity:0;width:0;height:0}
.switch-track{position:absolute;inset:0;border-radius:99px;background:rgba(148,163,184,.25);border:1px solid var(--line);transition:.2s}
.switch-thumb{position:absolute;width:18px;height:18px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 2px 5px rgba(0,0,0,.25);transition:.2s}
.switch input:checked ~ .switch-track{background:linear-gradient(135deg,#8b5cf6,#6d28d9);border-color:rgba(139,92,246,.5)}
.switch input:checked ~ .switch-thumb{transform:translateX(20px)}
.check-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.check-card{display:flex;align-items:flex-start;gap:9px;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--panel2);cursor:pointer}
.check-card input{margin-top:2px}
.check-card b{display:block;font-size:11.5px}
.check-card small{display:block;font-size:10px;color:var(--muted);margin-top:1px;word-break:break-all}

/* alerts */
.alert{display:flex;align-items:flex-start;gap:10px;padding:12px 13px;border-radius:12px;border:1px solid var(--line);margin-bottom:16px;font-size:12px;font-weight:600}
.alert-ok{background:var(--ok-soft);border-color:rgba(52,211,153,.22);color:#a7f3d0}
.alert-bad{background:var(--bad-soft);border-color:rgba(251,113,133,.22);color:#fecdd3}
html[data-theme="light"] .alert-ok{color:#047857}
html[data-theme="light"] .alert-bad{color:#be123c}
.alert-ic{flex-shrink:0;margin-top:1px}
.alert-body{flex:1;min-width:0;line-height:1.45}
.alert-x{border:0;background:transparent;color:currentColor;opacity:.65;padding:2px;display:grid;place-items:center}
.alert-x:hover{opacity:1}
.notice{display:flex;gap:11px;padding:13px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);font-size:11.5px;color:var(--muted);margin-bottom:16px}
.notice .ic{color:var(--acc2);margin-top:1px}
.notice b{color:var(--ink)}

/* code / copy */
.code-box{display:flex;align-items:center;gap:10px;padding:10px 10px 10px 13px;border-radius:11px;border:1px solid var(--line);background:rgba(3,5,10,.55);min-width:0}
html[data-theme="light"] .code-box{background:#f6f8fc}
.code-box code{flex:1;min-width:0;font-family:var(--mono);font-size:11.5px;color:#e2e8f0;word-break:break-all;line-height:1.55}
html[data-theme="light"] .code-box code{color:#1e293b}
.code-box.tall{padding:16px}
.code-box.tall code{font-size:15px;letter-spacing:.04em}
.copy-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--panel2);color:var(--muted);font-size:10px;font-weight:800;flex-shrink:0}
.copy-btn:hover{color:var(--ink);border-color:var(--line2)}
.copy-btn.copied{color:var(--ok);border-color:rgba(52,211,153,.3)}
.reveal{border-color:rgba(139,92,246,.35);background:radial-gradient(600px 200px at 10% 0,rgba(139,92,246,.2),transparent 70%),var(--panel)}

/* detail layouts */
.detail-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:16px;align-items:start}
.kv{display:grid;grid-template-columns:minmax(90px,auto) minmax(0,1fr);gap:8px 16px;font-size:11.5px}
.kv dt{color:var(--muted);font-weight:650}
.kv dd{margin:0;text-align:right;font-weight:700;min-width:0;word-break:break-word}
.meter{height:6px;border-radius:99px;background:rgba(148,163,184,.15);overflow:hidden;border:1px solid var(--line)}
.meter span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#8b5cf6,#22d3ee)}
.timeline{display:flex;flex-direction:column}
.timeline-item{display:flex;gap:11px;padding:10px 0;border-bottom:1px solid var(--line)}
.timeline-item:last-child{border-bottom:0;padding-bottom:0}
.timeline-dot{width:8px;height:8px;border-radius:99px;background:var(--acc);box-shadow:0 0 0 4px var(--acc-soft);margin-top:5px;flex-shrink:0}
.timeline-dot.bad{background:var(--bad);box-shadow:0 0 0 4px var(--bad-soft)}
.timeline-dot.ok{background:var(--ok);box-shadow:0 0 0 4px var(--ok-soft)}
.timeline-main{flex:1;min-width:0}
.timeline-main b{font-size:11.5px;font-weight:750;display:block}
.timeline-main p{font-size:10.5px;color:var(--muted);margin:2px 0 0;word-break:break-word}
.timeline-time{font-size:9.5px;color:var(--faint);white-space:nowrap;margin-top:1px}

/* empty */
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:38px 18px;color:var(--muted)}
.empty-ic{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:var(--acc-soft);color:#c4b5fd;border:1px solid var(--acc-line);margin-bottom:11px}
html[data-theme="light"] .empty-ic{color:var(--acc)}
.empty h3{margin:0;font-size:13px;color:var(--ink)}
.empty p{margin:4px 0 0;font-size:11.5px;max-width:360px}
.empty-action{margin-top:13px}

/* quick action tiles */
.quick-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.quick{display:flex;align-items:center;gap:10px;padding:11px;border-radius:11px;border:1px solid var(--line);background:var(--panel2);transition:.15s}
.quick:hover{border-color:var(--acc-line);background:var(--acc-soft);transform:translateY(-1px)}
.quick .qic{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--acc-soft);color:#c4b5fd;border:1px solid var(--acc-line);flex-shrink:0}
html[data-theme="light"] .quick .qic{color:var(--acc)}
.quick b{display:block;font-size:11.5px;font-weight:750}
.quick small{display:block;font-size:9.5px;color:var(--muted);margin-top:1px}

/* endpoint list */
.endpoint{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:11.5px}
.endpoint:last-child{border-bottom:0}
.method{font-family:var(--mono);font-size:9px;font-weight:800;letter-spacing:.06em;padding:3px 6px;border-radius:6px;background:var(--acc-soft);color:#c4b5fd;border:1px solid var(--acc-line);flex-shrink:0}
html[data-theme="light"] .method{color:var(--acc)}
.endpoint code{font-family:var(--mono);font-size:11px;color:var(--muted);word-break:break-all}
.endpoint .dot-ok{margin-left:auto;color:var(--ok);font-size:9px;font-weight:800;letter-spacing:.08em;white-space:nowrap}

/* dialog */
dialog{border:1px solid var(--line2);border-radius:17px;background:var(--panel-solid);color:var(--ink);padding:0;width:min(440px,calc(100vw - 32px));box-shadow:0 30px 100px rgba(0,0,0,.5)}
dialog::backdrop{background:rgba(2,4,10,.68);backdrop-filter:blur(5px)}
.dialog-body{padding:20px}
.dialog-ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--bad-soft);color:var(--bad);border:1px solid rgba(251,113,133,.25);margin-bottom:12px}
.dialog-body h3{margin:0;font-size:16px;letter-spacing:-.02em}
.dialog-body p{margin:6px 0 0;font-size:12px;color:var(--muted)}
.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}

/* auth */
.auth-wrap{min-height:100vh;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);position:relative;z-index:1}
.auth-side{position:relative;overflow:hidden;padding:48px;display:flex;flex-direction:column;justify-content:space-between;border-right:1px solid var(--line);background:
  radial-gradient(700px 500px at 10% 0,rgba(139,92,246,.24),transparent 65%),
  radial-gradient(600px 500px at 90% 100%,rgba(34,211,238,.14),transparent 65%),
  linear-gradient(160deg,rgba(14,16,25,.98),rgba(7,8,13,.98))}
html[data-theme="light"] .auth-side{background:
  radial-gradient(700px 500px at 10% 0,rgba(139,92,246,.16),transparent 65%),
  radial-gradient(600px 500px at 90% 100%,rgba(34,211,238,.12),transparent 65%),
  linear-gradient(160deg,#ffffff,#f3f6ff)}
.auth-side::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(148,163,184,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.055) 1px,transparent 1px);background-size:40px 40px;mask-image:radial-gradient(circle at 30% 20%,#000,transparent 75%)}
.auth-side>*{position:relative;z-index:1}
.auth-brand{display:flex;align-items:center;gap:12px}
.auth-hero{max-width:560px;margin:48px 0}
.auth-hero .hero-kicker{margin-bottom:16px}
.auth-hero h1{font-size:clamp(32px,4.4vw,54px);line-height:1.02;letter-spacing:-.05em;margin:0;font-weight:900}
.auth-hero h1 .grad{background:linear-gradient(100deg,#c4b5fd,#67e8f9);-webkit-background-clip:text;background-clip:text;color:transparent}
html[data-theme="light"] .auth-hero h1 .grad{background:linear-gradient(100deg,#6d28d9,#0891b2);-webkit-background-clip:text;background-clip:text;color:transparent}
.auth-hero p{color:var(--muted);font-size:14px;line-height:1.6;margin:16px 0 0;max-width:480px}
.auth-feats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:28px;max-width:520px}
.auth-feat{display:flex;gap:9px;padding:11px;border-radius:11px;border:1px solid var(--line);background:rgba(17,20,31,.5);backdrop-filter:blur(10px)}
html[data-theme="light"] .auth-feat{background:rgba(255,255,255,.7)}
.auth-feat .ic{color:var(--acc2);margin-top:1px}
.auth-feat b{display:block;font-size:11px;font-weight:750}
.auth-feat small{display:block;font-size:10px;color:var(--muted);margin-top:2px}
.auth-foot{font-size:10.5px;color:var(--faint);display:flex;gap:14px;flex-wrap:wrap}
.auth-main{display:flex;align-items:center;justify-content:center;padding:36px 22px;position:relative;background:var(--bg)}
.auth-card{width:100%;max-width:420px;padding:28px;border-radius:20px;border:1px solid var(--line);background:var(--panel);backdrop-filter:blur(22px);box-shadow:var(--shadow)}
.auth-card h2{margin:0;font-size:22px;letter-spacing:-.03em;font-weight:850}
.auth-card .sub{color:var(--muted);font-size:12px;margin:6px 0 20px}
.auth-card .field{margin-bottom:13px}
.auth-card .btn-primary{width:100%;padding:12px;margin-top:4px}
.auth-card .auth-alt{text-align:center;font-size:11px;color:var(--muted);margin-top:16px}
.auth-theme{position:fixed;top:18px;right:18px;z-index:10}

/* sidebar overlay / mobile nav */
.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(2,4,10,.6);backdrop-filter:blur(3px);z-index:55}
.mobile-nav{display:none}
.footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:26px 4px 0;color:var(--faint);font-size:10px;font-weight:650;letter-spacing:.04em}
.footer a{color:var(--muted)}
.mono-block{font-family:var(--mono);font-size:11px;background:rgba(3,5,10,.5);border:1px solid var(--line);border-radius:10px;padding:12px;overflow:auto;color:#cbd5e1}
html[data-theme="light"] .mono-block{background:#f6f8fc;color:#1e293b}

@media(max-width:1100px){
  .grid-4{grid-template-columns:repeat(2,minmax(0,1fr))}
  .detail-grid{grid-template-columns:1fr}
}
@media(max-width:920px){
  .app{grid-template-columns:1fr}
  .sidebar{position:fixed;left:0;top:0;bottom:0;width:280px;transform:translateX(-102%);transition:transform .24s ease;box-shadow:30px 0 80px rgba(0,0,0,.45)}
  .sidebar.open{transform:translateX(0)}
  .sidebar-overlay.show{display:block}
  .mobile-only{display:inline-flex!important}
  .hide-mobile{display:none!important}
  .topbar{padding:0 16px;height:64px}
  .content{padding:20px 16px 100px}
  .mobile-nav{display:flex;position:fixed;left:12px;right:12px;bottom:12px;z-index:50;padding:6px;border-radius:17px;border:1px solid var(--line2);background:rgba(14,16,25,.88);backdrop-filter:blur(20px);box-shadow:0 16px 50px rgba(0,0,0,.4);justify-content:space-around}
  html[data-theme="light"] .mobile-nav{background:rgba(255,255,255,.9)}
  .mobile-nav a{display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 9px;border-radius:10px;color:var(--faint);font-size:8.5px;font-weight:750;letter-spacing:.04em}
  .mobile-nav a.active{color:var(--ink);background:var(--acc-soft)}
  .mobile-nav a.active .ic{color:#c4b5fd}
  html[data-theme="light"] .mobile-nav a.active .ic{color:var(--acc)}
  .auth-wrap{grid-template-columns:1fr}
  .auth-side{padding:26px 22px 22px;border-right:0;border-bottom:1px solid var(--line);justify-content:flex-start}
  .auth-hero{margin:24px 0 0}
  .auth-hero h1{font-size:clamp(30px,8vw,42px)}
  .auth-hero p{font-size:12.5px}
  .auth-feats{display:none}
  .auth-foot{display:none}
  .auth-main{padding:22px 16px 40px}
  .hero{padding:20px}
  .hero-grid{grid-template-columns:1fr}
  .server-control{min-width:0}
}
@media(max-width:680px){
  .grid-2,.grid-3,.form-grid{grid-template-columns:1fr}
  .form-grid .span-2{grid-column:span 1}
  .grid-4{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .page-head h1{font-size:23px}
  .page-head-actions{width:100%}
  .page-head-actions .btn{flex:1}
  .card{padding:16px;border-radius:15px}
  .kpi{padding:13px}
  .kpi-value{font-size:25px}
  .quick-grid{grid-template-columns:1fr}
  .toolbar .search{max-width:none;width:100%}
  .segmented{width:100%}
  .table-wrap{border:0;background:transparent;overflow:visible}
  table.tbl{min-width:0;display:block}
  .tbl thead{display:none}
  .tbl tbody{display:flex;flex-direction:column;gap:9px}
  .tbl tr{display:block;border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:11px}
  .tbl td{display:flex;justify-content:space-between;gap:12px;padding:5px 2px;border:0;text-align:right;min-width:0}
  .tbl td::before{content:attr(data-label);color:var(--faint);font-size:8.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;text-align:left;flex-shrink:0;padding-top:2px}
  .tbl td[data-label=""]::before,.tbl td.full::before{display:none}
  .tbl td.full{display:block;text-align:left}
  .tbl .actions{justify-content:flex-end}
  .table-foot{padding:10px 0;border-top:0}
  .kv dd{text-align:left}
  .kv{grid-template-columns:1fr;gap:2px 0}
  .kv dt{margin-top:7px}
  .detail-grid{gap:12px}
  .page-head{margin-bottom:16px}
  .hero h2{font-size:25px}
  .hero-meta{gap:12px}
  .code-box.tall code{font-size:13px}
  .footer{padding-bottom:8px}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.fade-up{animation:fadeUp .35s ease both}
`;

export const BASE_JS = `
function openSidebar(){document.getElementById('sidebar').classList.add('open');document.getElementById('sidebar-overlay').classList.add('show')}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-overlay').classList.remove('show')}
function toggleTheme(){try{var h=document.documentElement;var n=h.getAttribute('data-theme')==='light'?'dark':'light';h.setAttribute('data-theme',n);localStorage.setItem('mak-theme',n)}catch(e){}}
function copyText(text,btn){var done=function(){if(!btn)return;btn.classList.add('copied');var old=btn.innerHTML;btn.innerHTML='<svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></svg><span>Copied</span>';setTimeout(function(){btn.classList.remove('copied');btn.innerHTML=old},1600)};if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(done).catch(function(){fallbackCopy(text,done)})}else{fallbackCopy(text,done)}}
function fallbackCopy(text,cb){var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');cb&&cb()}catch(e){}document.body.removeChild(ta)}
function copyEl(id,btn){var el=document.getElementById(id);if(el)copyText(el.textContent.trim(),btn)}
function downloadText(id,filename,btn){var el=document.getElementById(id);if(!el)return;var blob=new Blob([el.textContent.trim()],{type:'text/plain'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename||'mak.txt';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},800);if(btn){var old=btn.innerHTML;btn.innerHTML='<span>Downloaded</span>';setTimeout(function(){btn.innerHTML=old},1500)}}
function askConfirm(form,title,message,danger){var d=document.getElementById('confirm-dialog');if(!d){if(confirm(message||title)){form.submit()}return false}window.__makPendingForm=form;document.getElementById('confirm-title').textContent=title||'Confirm action';document.getElementById('confirm-message').textContent=message||'';var ic=document.getElementById('confirm-icon');if(ic){ic.className='dialog-ic '+(danger?'':'ok')}d.showModal();return false}
function confirmYes(){var d=document.getElementById('confirm-dialog');var f=window.__makPendingForm;window.__makPendingForm=null;if(d)d.close();if(f)f.submit()}
function confirmNo(){var d=document.getElementById('confirm-dialog');window.__makPendingForm=null;if(d)d.close()}
function toggleUserMenu(e){var m=document.getElementById('user-menu');if(!m)return;if(e&&e.target.closest('.user-menu-pop'))return;m.classList.toggle('open')}
document.addEventListener('click',function(e){var m=document.getElementById('user-menu');if(m&&!e.target.closest('#user-menu'))m.classList.remove('open');var s=document.getElementById('sidebar');if(s&&s.classList.contains('open')&&!e.target.closest('#sidebar')&&!e.target.closest('.mobile-menu-btn'))closeSidebar()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeSidebar();var m=document.getElementById('user-menu');if(m)m.classList.remove('open')}});
document.addEventListener('DOMContentLoaded',function(){var f=document.querySelectorAll('.alert');f.forEach(function(x){setTimeout(function(){if(x)x.style.display='none'},9000)});});
`;

export const THEME_EARLY = `<script>(function(){try{var t=localStorage.getItem('mak-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`;

function navItem(href, active, iconName, label, badge = '') {
  return `<a href="${esc(href)}" class="nav-item ${active ? 'active' : ''}">${icon(iconName, 17)}<span>${esc(label)}</span>${badge ? `<span class="nav-badge">${esc(badge)}</span>` : ''}</a>`;
}

export function layout(o) {
  const {
    title, active = '', admin = {}, server = { enabled: false }, content = '',
    flash = '', csrf = '', signingReady = false, panelName = 'MUNDO MAK', version = '1.0.0',
  } = o;
  const initial = esc(String(admin.username || 'A').slice(0, 1).toUpperCase());
  const serverOn = !!server.enabled;
  return `<!DOCTYPE html><html lang="en" data-theme="light"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark"><meta name="theme-color" content="#F5F6F8">
<title>${esc(title)} · ${esc(panelName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>${CSS}</style>${THEME_EARLY}</head>
<body>
<div class="aurora a1"></div><div class="aurora a2"></div><div class="aurora a3"></div>
<div class="app">
  <aside class="sidebar" id="sidebar">
    <a class="brand" href="/dashboard"><span class="brand-mark">${icon('layers', 22)}</span><span class="brand-text"><b>${esc(panelName)}</b><small>SDK PANEL · MAK/1</small></span></a>
    <div class="server-mini ${serverOn ? 'on' : 'off'}"><span class="pulse-dot"></span><span>Server <b>${serverOn ? 'ONLINE' : 'OFFLINE'}</b></span>${signingReady ? '' : `<span class="chip bad" style="margin-left:auto">KEY</span>`}</div>
    <nav class="nav">
      <div class="nav-label">SDK Panel</div>
      ${navItem('/dashboard', active === 'dashboard', 'grid', 'Dashboard')}
      ${navItem('/licenses', active === 'licenses', 'key', 'MAK Keys')}
      ${navItem('/guests', active === 'guests', 'apps', 'Guest Apps')}
      ${navItem('/hosts', active === 'hosts', 'server', 'Hosts')}
      <div class="nav-label">Monitoring</div>
      ${navItem('/devices', active === 'devices', 'smartphone', 'Devices')}
      ${navItem('/sessions', active === 'sessions', 'radio', 'Sessions')}
      ${navItem('/logs', active === 'logs', 'activity', 'Security Logs')}
      <div class="nav-label">System</div>
      ${navItem('/settings', active === 'settings', 'settings', 'Settings')}
    </nav>
    <div class="sidebar-foot">
      <div class="user-card">
        <span class="avatar">${initial}</span>
        <div class="who"><b>${esc(admin.username || 'admin')}</b><small>${esc(admin.role || 'OWNER')}</small></div>
        <form method="post" action="/logout" style="margin:0">${csrf ? `<input type="hidden" name="_csrf" value="${esc(csrf)}">` : ''}<button class="logout-btn" title="Sign out" type="submit">${icon('logout', 15)}</button></form>
      </div>
      <div class="build"><span>MAK/1 · v${esc(version)}</span><span>TLS 1.3</span></div>
    </div>
  </aside>
  <div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div>
  <div class="main">
    <header class="topbar">
      <button class="icon-btn mobile-only mobile-menu-btn" onclick="openSidebar()" aria-label="Open menu">${icon('menu', 19)}</button>
      <div class="topbar-title"><span class="crumb">SDK Panel</span><strong>${esc(title)}</strong></div>
      <div class="topbar-actions">
        <a class="server-pill ${serverOn ? 'on' : ''}" href="/settings">Server ${serverOn ? 'online' : 'offline'}</a>
        <button class="icon-btn" onclick="toggleTheme()" aria-label="Toggle theme" title="Light / dark">${icon('sun', 17)}</button>
        <div class="user-menu" id="user-menu">
          <button class="avatar" onclick="toggleUserMenu(event)" aria-label="Account">${initial}</button>
          <div class="user-menu-pop">
            <a href="/settings">${icon('settings', 16)} Settings</a>
            <a href="/mak/v1/status" target="_blank" rel="noopener">${icon('external', 16)} Protocol status</a>
            <form method="post" action="/logout" style="margin:0">${csrf ? `<input type="hidden" name="_csrf" value="${esc(csrf)}">` : ''}<button type="submit">${icon('logout', 16)} Sign out</button></form>
          </div>
        </div>
      </div>
    </header>
    <main class="content">
      ${flashHtml(o.ok, o.err)}
      ${flash}
      ${content}
      <div class="footer"><span>MUNDO Activation · MAK/1 · Server-authoritative</span><span>${signingReady ? 'Ed25519 signing active' : 'Signing key not configured'}</span></div>
    </main>
  </div>
</div>
<nav class="mobile-nav">
  <a href="/dashboard" class="${active === 'dashboard' ? 'active' : ''}">${icon('grid', 18)}<span>Home</span></a>
  <a href="/licenses" class="${active === 'licenses' ? 'active' : ''}">${icon('key', 18)}<span>Keys</span></a>
  <a href="/guests" class="${active === 'guests' ? 'active' : ''}">${icon('apps', 18)}<span>Apps</span></a>
  <a href="/logs" class="${active === 'logs' ? 'active' : ''}">${icon('activity', 18)}<span>Logs</span></a>
  <a href="/settings" class="${active === 'settings' ? 'active' : ''}">${icon('settings', 18)}<span>Settings</span></a>
</nav>
<dialog id="confirm-dialog">
  <div class="dialog-body">
    <div class="dialog-ic" id="confirm-icon">${icon('alert', 20)}</div>
    <h3 id="confirm-title">Confirm action</h3>
    <p id="confirm-message"></p>
    <div class="dialog-actions"><button class="btn" onclick="confirmNo()">Cancel</button><button class="btn btn-danger" onclick="confirmYes()">Confirm</button></div>
  </div>
</dialog>
<script>${BASE_JS}</script>
</body></html>`;
}

export function authLayout({ title, subtitle = '', body = '', panelName = 'MUNDO MAK', ok = '', err = '', footer = '' }) {
  return `<!DOCTYPE html><html lang="en" data-theme="light"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark"><meta name="theme-color" content="#F5F6F8">
<title>${esc(title)} · ${esc(panelName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>${CSS}</style>${THEME_EARLY}</head>
<body>
<div class="aurora a1"></div><div class="aurora a2"></div><div class="aurora a3"></div>
<button class="icon-btn auth-theme" onclick="toggleTheme()" aria-label="Toggle theme">${icon('sun', 17)}</button>
<div class="auth-wrap">
  <aside class="auth-side">
    <div class="auth-brand"><span class="brand-mark">${icon('layers', 22)}</span><span class="brand-text"><b>${esc(panelName)}</b><small>SDK PANEL · MAK/1</small></span></div>
    <div class="auth-hero">
      <span class="hero-kicker">${icon('radio', 12)} MAK/1 protocol</span>
      <h1>Silent activation.<br><span class="grad">Server authority.</span></h1>
      <p>One credential per host APK. Ed25519-signed decisions, ECDSA device proof, replay-proof challenges, and native-enforced guest installation.</p>
      <div class="auth-feats">
        <div class="auth-feat">${icon('shield-check', 17)}<div><b>Signed decisions</b><small>Ed25519 on every allow &amp; deny</small></div></div>
        <div class="auth-feat">${icon('fingerprint', 17)}<div><b>Device-bound</b><small>P-256 Keystore proof</small></div></div>
        <div class="auth-feat">${icon('refresh', 17)}<div><b>Replay-proof</b><small>Single-use challenges</small></div></div>
        <div class="auth-feat">${icon('lock', 17)}<div><b>Zero UI</b><small>No login or key screen</small></div></div>
      </div>
    </div>
    <div class="auth-foot"><span>MAK/1</span><span>TLS 1.3</span><span>Cloudflare Edge</span><span>D1</span></div>
  </aside>
  <main class="auth-main">
    <div class="auth-card fade-up">
      <div class="eyebrow">${esc(footer || 'Secure control plane')}</div>
      <h2>${esc(title)}</h2>
      <p class="sub">${subtitle}</p>
      ${flashHtml(ok, err)}
      ${body}
    </div>
  </main>
</div>
<script>${BASE_JS}</script>
</body></html>`;
}
