import { CSS, BASE_JS, MODE_BTN, MODE_EARLY, CMDK_BTN, PAL_SHELL, accentStyle, esc, navClass, sideLabel } from './ui.js';

export function panelLayout(o) {
  const { title, route, sess, panelName, content, theme, accent } = o;
  const th = theme || 'blue';
  const role = sess.role || 'RESELLER';
  // Role hierarchy: PROFESSOR > OWNER > ADMIN > RESELLER (nav mirrors API gates).
  const isOA = role === 'OWNER' || role === 'ADMIN' || role === 'PROFESSOR';
  const isOwner = role === 'OWNER' || role === 'PROFESSOR';
  const isProf = role === 'PROFESSOR';
  const canSeeSdk = sess.id === 1 || isProf;
  const initial = esc(String(sess.username || 'U').substring(0, 1).toUpperCase());
  const MGMT = isOA
    ? sideLabel('Management')
    + '<a href="/users" class="' + navClass('users', route) + '"><i class="bi bi-people-fill text-lg w-6 text-center"></i><span>User Management</span></a>'
    + (isOwner ? '<a href="/admins" class="' + navClass('admins', route) + '"><i class="bi bi-person-badge-fill text-lg w-6 text-center"></i><span>Admin Manager</span></a>'
    + '<a href="/permissions" class="' + navClass('permissions', route) + '"><i class="bi bi-shield-lock-fill text-lg w-6 text-center"></i><span>Permission</span></a>' : '')
    + '<a href="/referral" class="' + navClass('referral', route) + '"><i class="bi bi-diagram-3-fill text-lg w-6 text-center"></i><span>Referrals</span></a>'
    + sideLabel('System')
    + (isOwner ? '<a href="/aes" class="' + navClass('aes', route) + '"><i class="bi bi-shield-shaded text-lg w-6 text-center"></i><span>API Encryption</span></a>' : '')
    + '<a href="/api-test" class="' + navClass('api-test', route) + '"><i class="bi bi-broadcast text-lg w-6 text-center"></i><span>Live API Tester</span></a>'
    + '<a href="/loader-manager" class="' + navClass('loader-manager', route) + '"><i class="bi bi-box-seam-fill text-lg w-6 text-center"></i><span>Set Mod/Loader</span></a>'
    + '<a href="/server" class="' + navClass('server', route) + '"><i class="bi bi-hdd-fill text-lg w-6 text-center"></i><span>Server &amp; Mod</span></a>'
    : '';
  const SDK = canSeeSdk
    ? '<div class="side-divider"></div><a href="/sdk" class="' + navClass('sdk', route) + '"><i class="bi bi-boxes text-lg w-6 text-center"></i><span>SDK Panel</span><i class="bi bi-arrow-right-short text-xl ml-auto"></i></a>'
    : '';
  const TENANT = (sess.id === 1 || isProf)
    ? '<div class="side-divider"></div><a href="/create-panel" class="' + navClass('create-panel', route) + '"><i class="bi bi-server text-lg w-6 text-center"></i><span>New Tenant</span></a>'
    : '';
  const PGS = [['Dashboard', '/dashboard', 'bi-grid-1x2-fill'], ['Generate keys', '/generate', 'bi-key-fill'], ['Keys', '/keys', 'bi-view-list'], ['Activate panel', '/panel-activate', 'bi-ticket-detailed'], ['Settings', '/settings', 'bi-gear-fill']]
    .concat(isOA ? [['Users', '/users', 'bi-people-fill'], ['Referrals', '/referral', 'bi-diagram-3-fill'], ['Server & mod', '/server', 'bi-hdd-fill'], ['API tester', '/api-test', 'bi-broadcast'], ['Mod / loader', '/loader-manager', 'bi-box-seam-fill']] : [])
    .concat(isOwner ? [['Encryption', '/enc-api', 'bi-shield-check']] : [])
    .concat(canSeeSdk ? [['SDK panel', '/sdk', 'bi-boxes']] : [])
    .concat((sess.id === 1 || isProf) ? [['Tenants', '/tenant', 'bi-server']] : []);
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<title>' + esc(title) + ' - ' + esc(panelName) + '</title>'
    + '<script src="https://cdn.tailwindcss.com"></script>'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
    + '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">'
    + '<style>' + CSS + '</style>' + MODE_EARLY + '</head>'
    + '<body class="flex h-screen overflow-hidden relative" data-theme="' + esc(th) + '"' + accentStyle(accent) + '>'
    + '<div class="droplet drop-1"></div><div class="droplet drop-2"></div><div class="droplet drop-3"></div><div class="droplet drop-4"></div><div class="droplet drop-5"></div><div class="droplet drop-6"></div><div class="droplet drop-7"></div><div class="droplet drop-8"></div>'
    + '<div id="sidebar-overlay" onclick="toggleSidebar()" class="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 hidden md:hidden"></div>'
    + '<aside id="sidebar" class="w-[264px] shrink-0 glass-sidebar flex flex-col absolute inset-y-0 left-0 transform -translate-x-full md:relative md:translate-x-0 transition-transform duration-300 z-50">'
    + '<div class="px-5 pt-6 pb-5"><div class="flex items-center gap-3">'
    + '<div class="w-10 h-10 shrink-0 rounded-xl avatar-premium text-white flex items-center justify-center text-lg shadow"><i class="bi bi-shield-check"></i></div>'
    + '<div class="flex-1 min-w-0"><p class="truncate text-[15px] font-extrabold tracking-tight" style="color:var(--ink)">' + esc(panelName) + '</p>'
    + '<p class="font-mono text-[11px] truncate" style="color:var(--muted)">' + esc(sess.panel_code || '') + ' · ' + esc(role) + '</p></div>'
    + '<button onclick="toggleSidebar()" class="md:hidden text-2xl" style="color:var(--muted)" aria-label="Close menu"><i class="bi bi-x-lg"></i></button></div></div>'
    + '<nav class="flex-1 px-3 pb-4 overflow-y-auto" aria-label="Primary">'
    + sideLabel('Overview')
    + '<a href="/dashboard" class="' + navClass('dashboard', route) + '"><i class="bi bi-grid-1x2-fill text-lg w-6 text-center"></i><span>Dashboard</span></a>'
    + '<a href="/generate" class="' + navClass('generate', route) + '"><i class="bi bi-key-fill text-lg w-6 text-center"></i><span>Generate Keys</span></a>'
    + '<a href="/keys" class="' + navClass('keys', route) + '"><i class="bi bi-view-list text-lg w-6 text-center"></i><span>Key Manager</span></a>'
    + MGMT + SDK + TENANT
    + '<div class="side-divider"></div><a href="/settings" class="' + navClass('settings', route) + '"><i class="bi bi-gear-fill text-lg w-6 text-center"></i><span>Settings</span></a>'
    + '</nav><div class="p-3"><div class="clay-card rounded-xl p-3 flex items-center gap-2.5"><span class="status-dot"></span><div class="min-w-0"><p class="text-xs font-bold" style="color:var(--ink)">Systems live</p><p class="text-[11px] truncate" style="color:var(--muted)">' + esc(sess.panel_code || '') + ' tenant</p></div></div></div></aside>'
    + '<div class="flex-1 flex flex-col h-screen overflow-y-auto relative w-full z-10">'
    + '<header class="glass-header sticky top-0 z-30"><div class="flex items-center gap-3 px-4 lg:px-8 h-16">'
    + '<button onclick="toggleSidebar()" class="md:hidden mode-btn" aria-label="Open menu"><i class="bi bi-list text-xl"></i></button>'
    + '<div class="min-w-0"><p class="font-mono text-[11px] truncate" style="color:var(--muted)">ARC Auth <span style="color:var(--faint)">/</span> ' + esc(sess.panel_code || '') + '</p>'
    + '<h1 class="truncate text-base md:text-lg font-extrabold tracking-tight" style="color:var(--ink)">' + esc(title) + '</h1></div>'
    + '<div class="ml-auto hidden md:inline-flex items-center gap-2"><span class="live-pill"><span class="status-dot"></span>Live</span></div><div class="ml-auto md:ml-0 flex items-center gap-2">' + CMDK_BTN + MODE_BTN
    + '<div class="hidden sm:flex flex-col items-end mr-1"><span class="text-sm font-bold" style="color:var(--ink)">' + esc(sess.username) + '</span><span class="text-[10px] font-extrabold tracking-widest uppercase" style="color:var(--p1)">' + esc(role) + '</span></div>'
    + '<div class="relative group"><div class="w-10 h-10 rounded-xl avatar-premium text-white flex items-center justify-center font-bold text-base cursor-pointer">' + initial + '</div>'
    + '<div class="absolute right-0 mt-3 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all rounded-xl overflow-hidden bg-white border border-slate-200 shadow-lg"><div class="p-3"><div class="px-4 py-3 border-b border-slate-200 mb-2"><p class="font-bold text-slate-800 text-sm">' + esc(sess.username) + '</p><p class="text-xs text-slate-600">' + esc(sess.panel_code || '') + '</p></div>'
    + '<a href="/settings" class="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 rounded-xl font-medium"><i class="bi bi-gear"></i> Settings</a>'
    + '<div class="border-t border-slate-200 my-2"></div><a href="/logout" class="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-xl font-medium"><i class="bi bi-box-arrow-right"></i> Sign Out</a>'
    + '</div></div></div></div></header>'
    + '<main class="p-4 md:p-8 pb-20 relative z-10"><div class="mx-auto w-full max-w-6xl">' + content + '</div></main></div>'
    + PAL_SHELL + '<script>window.PGS=' + JSON.stringify(PGS) + ';</script>'
    + '<script>' + BASE_JS + '</script></body></html>';
}

export function pageHead(title, icon, sub) {
  return '<div class="mb-6"><h1 class="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-3"><i class="bi ' + icon + ' text-emerald-500"></i> ' + title + '</h1><p class="text-slate-500 text-sm mt-1">' + sub + '</p></div>';
}

export function alertBox(kind, title, msg) {
  const c = kind === 'ok' ? ['#10b981', 'emerald'] : kind === 'warn' ? ['#f59e0b', 'amber'] : ['#ef4444', 'red'];
  return '<div class="glass-card p-4 mb-6 flex items-start gap-3" style="border-left:4px solid ' + c[0] + '"><div class="flex-1"><p class="font-bold text-' + c[1] + '-700 text-sm">' + title + '</p><p class="text-xs text-slate-600 mt-0.5 break-all">' + msg + '</p></div></div>';
}
