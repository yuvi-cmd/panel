export function esc(s) {
  // Escape &, <, >, " and ' so values are safe in HTML text, attributes
  // and single-quoted JS strings (e.g. onclick="doCopy('...')").
  // NOTE: for new code prefer jsArg() (JSON.stringify) over manual quoting.
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

// Safe embedding of an arbitrary string as a single JS argument inside
// HTML attributes: returns a double-quoted JSON string (HTML-escaped).
export function jsArg(s) {
  return JSON.stringify(String(s ?? '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function navClass(path, cur) {
  const base = 'nav-glass-item relative flex items-center gap-3 px-4 py-3 rounded-2xl font-medium mb-1.5 ';
  return base + (path === cur ? 'nav-active text-white font-semibold' : 'text-slate-700');
}

export const CSS = `
*{ -webkit-tap-highlight-color: transparent; }
html,body{height:100%;}
body{background:#F8FAFC;background-attachment:fixed;position:relative;overflow-x:hidden;color:#18181B;font-family:Inter,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
body::before{content:none;}
.droplet,.droplet::after{display:none !important;}
.glass-card{background:#FFFFFF;border-radius:12px;box-shadow:0 1px 2px rgba(16,24,40,0.05);border:1px solid #E5E7EB;}
.glass-sidebar{background:#FFFFFF;border-right:1px solid #E5E7EB;position:relative;}
.glass-header{background:#FFFFFF;border-bottom:1px solid #E5E7EB;position:relative;}
.nav-glass-item{background:transparent;border:1px solid transparent;cursor:pointer;user-select:none;border-radius:8px;}
.nav-active{background:var(--p1) !important;border:1px solid var(--p1) !important;box-shadow:0 1px 2px var(--glow) !important;color:#fff !important;border-radius:8px !important;}
.clay-card{background:#FFFFFF;box-shadow:0 1px 2px rgba(16,24,40,0.05);border:1px solid #E5E7EB;}
.btn-premium{background:var(--p1);color:#fff !important;box-shadow:0 1px 2px var(--glow);border:1px solid var(--p1);cursor:pointer;}
.btn-premium:hover{background:var(--p2);border-color:var(--p2);}
input,select,textarea{border-radius:8px !important;}
.feature-card{background:#FFFFFF;border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;cursor:pointer;border:1px solid #E5E7EB;}
.feature-card input[type=checkbox]{width:20px !important;height:20px !important;accent-color:var(--p1);flex-shrink:0;}
.feature-card.checked{background:#EEF2FF;border-color:var(--p1);}
.custom-select{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='3' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 16px center;padding-right:44px !important;cursor:pointer;}
.dual-tab-container{display:inline-flex;background:#FFFFFF;border-radius:12px;padding:4px;border:1px solid #E5E7EB;box-shadow:0 1px 2px rgba(16,24,40,0.05);}
.dual-tab-btn{padding:10px 24px;border-radius:8px;font-weight:600;font-size:14px;color:#64748B;cursor:pointer;border:none;background:transparent;}
.dual-tab-btn.active-mundo{background:var(--p1);color:#fff;box-shadow:0 1px 2px var(--glow);}
.dual-tab-btn.active-bcore{background:#1E293B;color:#fff;box-shadow:0 1px 2px rgba(16,24,40,0.2);}
.tab-content-panel{display:none;}
.tab-content-panel.active{display:block;}
::-webkit-scrollbar{width:8px;height:8px;}
::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:10px;}
:root{--p1:#4F46E5;--p2:#4338CA;--glow:rgba(79,70,229,0.18);}
body[data-theme="cherry"]{--p1:#E11D48;--p2:#9F1239;--glow:rgba(225,29,72,0.18);}
body[data-theme="gold"]{--p1:#B45309;--p2:#92400E;--glow:rgba(180,83,9,0.18);}
body[data-theme="emerald"]{--p1:#059669;--p2:#047857;--glow:rgba(5,150,105,0.18);}
.avatar-premium{background:var(--p1);box-shadow:0 1px 2px var(--glow);}
.brand-text{background:var(--p1);-webkit-background-clip:text;background-clip:text;color:transparent;}
.back-link{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;font-weight:700;margin-bottom:16px;background:#FFFFFF;border:1px solid #E5E7EB;color:#475569;font-size:14px;}
.pill{padding:10px 14px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;border:1px solid #E5E7EB;background:#FFFFFF;color:#475569;text-align:center;transition:all 0.2s;}
.pill.on{background:var(--p1);color:#fff;border-color:var(--p1);box-shadow:0 1px 2px var(--glow);}
.stepper{display:flex;align-items:center;gap:10px;}
.stepper button{width:42px;height:42px;border-radius:10px;font-size:20px;font-weight:900;line-height:1;background:#FFFFFF;border:1px solid #E5E7EB;color:#18181B;}
.costbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-radius:12px;background:#F8FAFC;border:1px solid #E5E7EB;}
.theme-swatch{height:64px;border-radius:12px;margin-bottom:10px;border:1px solid #E5E7EB;}
body[data-theme="cherry"] .theme-swatch,body[data-theme="gold"] .theme-swatch,body[data-theme="emerald"] .theme-swatch{border:1px solid #E5E7EB;}
.sw{position:relative;width:60px;height:32px;flex-shrink:0;display:inline-block;}
.sw input{opacity:0;width:0;height:0;}
.sw .tr{position:absolute;inset:0;border-radius:999px;background:rgba(148,163,184,0.45);transition:.3s;cursor:pointer;}
.sw .tr:before{content:'';position:absolute;width:26px;height:26px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.3s;box-shadow:0 2px 6px rgba(0,0,0,0.25);}
.sw input:checked + .tr{background:var(--p1);}
.sw input:checked + .tr:before{transform:translateX(28px);}
.inp-icon{position:relative;}
.inp-icon > i{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#94A3B8;}
.inp-icon > input{padding-left:40px !important;}
`;

export const BASE_JS = `
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('-translate-x-full');document.getElementById('sidebar-overlay').classList.toggle('hidden');}
function switchDualTab(containerId,tabName){const container=document.getElementById(containerId);if(!container)return;const wrapper=container.closest('.dual-tab-wrapper');if(!wrapper)return;const buttons=wrapper.querySelectorAll('.dual-tab-btn');const panels=wrapper.querySelectorAll('.tab-content-panel');buttons.forEach(b=>b.classList.remove('active-mundo','active-bcore'));panels.forEach(p=>p.classList.remove('active'));const ab=wrapper.querySelector('.dual-tab-btn[data-tab="'+tabName+'"]');const ap=wrapper.querySelector('.tab-content-panel[data-tab="'+tabName+'"]');if(ab)ab.classList.add(tabName==='mundo'?'active-mundo':'active-bcore');if(ap)ap.classList.add('active');try{localStorage.setItem('sdkTab_'+wrapper.id,tabName);}catch(e){}}
document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('.dual-tab-wrapper').forEach(function(w){let saved='mundo';try{saved=localStorage.getItem('sdkTab_'+w.id)||'mundo';}catch(e){}const btn=w.querySelector('.dual-tab-btn[data-tab="'+saved+'"]')||w.querySelector('.dual-tab-btn');if(!btn)return;const tab=btn.getAttribute('data-tab');w.querySelectorAll('.dual-tab-btn').forEach(b=>b.classList.remove('active-mundo','active-bcore'));w.querySelectorAll('.tab-content-panel').forEach(p=>p.classList.remove('active'));btn.classList.add(tab==='mundo'?'active-mundo':'active-bcore');const p=w.querySelector('.tab-content-panel[data-tab="'+tab+'"]');if(p)p.classList.add('active');});});
function doCopy(text,btn){const ok=function(){if(!btn)return;const ic=btn.querySelector('i');if(!ic)return;const old=ic.className;ic.className='bi bi-check2 text-emerald-500';setTimeout(function(){ic.className=old;},1500);};if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(ok).catch(function(){fb(text,ok);});}else{fb(text,ok);}}
function fb(text,cb){const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');cb&&cb();}catch(e){}document.body.removeChild(ta);}
function copyUrl(id,btn){const el=document.getElementById(id);if(el)doCopy(el.innerText.trim(),btn);}
`;

export function layout(o) {
  const { title, route, username, panelCode, panelName, content, theme } = o;
  const th = theme || 'blue';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<title>' + esc(title) + ' - ' + esc(panelName) + '</title>'
    + '<script src="https://cdn.tailwindcss.com"></script>'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
    + '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">'
    + '<style>' + CSS + '</style></head>'
    + '<body class="flex h-screen overflow-hidden relative" data-theme="' + esc(th) + '">'
    + '<div class="droplet drop-1"></div><div class="droplet drop-2"></div><div class="droplet drop-3"></div><div class="droplet drop-4"></div><div class="droplet drop-5"></div><div class="droplet drop-6"></div><div class="droplet drop-7"></div><div class="droplet drop-8"></div>'
    + '<div id="sidebar-overlay" onclick="toggleSidebar()" class="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 hidden md:hidden"></div>'
    + '<aside id="sidebar" class="w-72 glass-sidebar flex flex-col absolute inset-y-0 left-0 transform -translate-x-full md:relative md:translate-x-0 transition-transform duration-300 z-50">'
    + '<div class="h-20 flex items-center justify-between px-6 border-b border-slate-200"><h1 class="text-lg font-extrabold tracking-tight flex items-center gap-3 truncate"><div class="w-10 h-10 shrink-0 rounded-xl avatar-premium text-white flex items-center justify-center shadow-lg"><i class="bi bi-boxes text-lg"></i></div><span class="truncate uppercase brand-text">' + esc(panelName) + '</span></h1>'
    + '<button onclick="toggleSidebar()" class="md:hidden text-slate-400 text-2xl"><i class="bi bi-x-lg"></i></button></div>'
    + '<nav class="flex-1 py-6 px-4 overflow-y-auto">'
    + '<div class="px-3 mb-2 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">SDK Panel</div>'
    + '<a href="/dashboard" class="back-link"><i class="bi bi-arrow-left-short text-2xl"></i><span>Back to Main Panel</span></a>'
    + '<a href="/sdk" class="' + navClass('sdk', route) + '"><i class="bi bi-speedometer2 text-lg w-6 text-center"></i> Dashboard</a>'
    + '<a href="/sdk/generate" class="' + navClass('sdk/generate', route) + '"><i class="bi bi-key-fill text-lg w-6 text-center"></i> Generate SDK</a>'
    + '<a href="/sdk/keys" class="' + navClass('sdk/keys', route) + '"><i class="bi bi-view-list text-lg w-6 text-center"></i> SDK Keys</a>'
    + '<a href="/sdk/server" class="' + navClass('sdk/server', route) + '"><i class="bi bi-hdd-network-fill text-lg w-6 text-center"></i> Server</a>'
    + '<a href="/sdk/hash" class="' + navClass('sdk/hash', route) + '"><i class="bi bi-fingerprint text-lg w-6 text-center"></i> Hash</a>'
    + '</nav><div class="p-4 border-t border-slate-200"><div class="glass-card p-3 text-center"><p class="text-[10px] font-extrabold brand-text uppercase tracking-wider">SDK Panel</p><p class="text-[9px] text-slate-400 mt-0.5">Dual Engine - Mundo + Bcore</p></div></div></aside>'
    + '<div class="flex-1 flex flex-col h-screen overflow-y-auto relative w-full z-10">'
    + '<header class="h-16 md:h-20 glass-header sticky top-0 z-30 flex items-center justify-between px-4 lg:px-10">'
    + '<div class="flex items-center gap-3 z-10 w-1/4"><button onclick="toggleSidebar()" class="md:hidden text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm"><i class="bi bi-list text-2xl"></i></button>'
    + '<div class="hidden md:flex flex-col"><span class="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">SDK Workspace</span><h2 class="font-bold text-slate-700 text-[15px]"><span class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg border border-indigo-200 font-mono text-sm">' + esc(panelCode) + '</span></h2></div></div>'
    + '<div class="absolute left-1/2 transform -translate-x-1/2 flex flex-col items-center z-0 w-1/2 max-w-[200px] md:max-w-xs text-center"><h2 class="text-base md:text-xl font-black tracking-[0.1em] uppercase truncate w-full"><span class="brand-text">' + esc(panelName) + '</span></h2><div class="h-1 w-10 md:w-14 rounded-full mt-1 mx-auto avatar-premium"></div></div>'
    + '<div class="flex items-center justify-end gap-3 z-10 w-1/4"><div class="hidden sm:flex flex-col items-end mr-1"><span class="text-sm font-bold text-slate-700">' + esc(username) + '</span><span class="text-[10px] font-extrabold tracking-widest brand-text uppercase">OWNER</span></div>'
    + '<div class="relative group"><div class="w-11 h-11 rounded-2xl avatar-premium text-white flex items-center justify-center font-bold text-lg border-2 border-white/80 cursor-pointer">' + esc(String(username || 'A').substring(0, 1).toUpperCase()) + '</div>'
    + '<div class="absolute right-0 mt-3 w-52 glass-card border border-white opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all"><div class="p-3"><a href="/logout" class="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-xl font-medium"><i class="bi bi-box-arrow-right"></i> Sign Out</a></div></div>'
    + '</div></div></header>'
    + '<main class="p-4 md:p-8 lg:p-10 pb-20 relative z-10">' + content + '</main></div>'
    + '<script>' + BASE_JS + '</script></body></html>';
}

export function authPage(o) {
  const { mode, error, msg, panelName } = o;
  const isSetup = mode === 'setup';
  const inner = (error ? '<div class="p-3 mb-4 rounded-2xl text-[13px] font-bold bg-red-50 border border-red-200 text-red-600"><i class="bi bi-exclamation-circle-fill mr-1"></i> ' + esc(error) + '</div>' : '')
    + (msg ? '<div class="p-3 mb-4 rounded-2xl text-[13px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-600"><i class="bi bi-check-circle-fill mr-1"></i> ' + esc(msg) + '</div>' : '')
    + '<form method="POST" class="space-y-4">'
    + '<div><label class="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">Username</label><input name="username" required class="w-full clay-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="admin"></div>'
    + '<div><label class="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">Password</label><input type="password" name="password" required class="w-full clay-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="••••••••"></div>'
    + (isSetup ? '<div class="p-3 rounded-2xl text-[11px] text-blue-700 bg-blue-50 border border-blue-100"><i class="bi bi-info-circle-fill mr-1"></i> Pehli baar admin banao. Yehi login hoga.</div>' : '')
    + '<button class="btn-premium w-full py-4 rounded-2xl font-extrabold text-sm uppercase tracking-wider">' + (isSetup ? 'Create Admin' : 'Login') + ' <i class="bi bi-arrow-right"></i></button></form>';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">'
    + '<title>' + esc(panelName) + ' - Login</title><script src="https://cdn.tailwindcss.com"></script>'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
    + '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">'
    + '<style>' + CSS + '</style></head>'
    + '<body style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px;">'
    + '<div class="droplet drop-1"></div><div class="droplet drop-2"></div><div class="droplet drop-3"></div><div class="droplet drop-4"></div><div class="droplet drop-5"></div>'
    + '<div class="w-full max-w-[400px] relative z-10"><div class="text-center mb-5"><div class="w-14 h-14 rounded-2xl avatar-premium flex items-center justify-center text-xl text-white mx-auto mb-2"><i class="bi bi-shield-lock-fill"></i></div>'
    + '<h1 class="text-lg font-black"><span class="brand-text">' + esc(panelName) + '</span></h1></div>'
    + '<div class="glass-card p-6"><div class="text-center mb-5"><h2 class="text-base font-black text-slate-800">' + (isSetup ? 'Setup Admin' : 'Welcome Back') + '</h2><p class="text-xs text-slate-500">SDK Panel - Mundo + Bcore</p></div>' + inner + '</div></div></body></html>';
}
