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
:root{
  --bg:#F8FAFC; --surface:#FFFFFF; --surface2:#F1F5FA; --line:#E5E7EB;
  --ink:#18181B; --muted:#64748B; --faint:#94A3B8;
  --p1:#4F46E5; --p2:#4338CA; --glow:rgba(79,70,229,0.18);
  --input:#FFFFFF; --code:#0F172A;
  --danger-bg:#FEF2F2; --danger-line:#FECACA; --danger-tx:#DC2626;
  --ok-bg:#ECFDF5; --ok-line:#A7F3D0; --ok-tx:#059669;
  --info-bg:#EEF2FF; --info-line:#C7D2FE; --info-tx:#4338CA;
}
body[data-theme="cherry"]{--p1:#E11D48;--p2:#9F1239;--glow:rgba(225,29,72,0.18);}
body[data-theme="gold"]{--p1:#B45309;--p2:#92400E;--glow:rgba(180,83,9,0.18);}
body[data-theme="emerald"]{--p1:#059669;--p2:#047857;--glow:rgba(5,150,105,0.18);}
html[data-mode="dark"]{
  color-scheme:dark;
  --bg:#0B0D10; --surface:#12151B; --surface2:#1A2029; --line:#242C37;
  --ink:#E9ECF1; --muted:#9AA3B2; --faint:#6B7484;
  --input:#1A2029; --code:#020617;
  --danger-bg:rgba(239,68,68,0.12); --danger-line:#7F1D1D; --danger-tx:#FCA5A5;
  --ok-bg:rgba(16,185,129,0.12); --ok-line:#065F46; --ok-tx:#6EE7B7;
  --info-bg:rgba(99,102,241,0.14); --info-line:#3730A3; --info-tx:#A5B4FC;
}
body{background:var(--bg);position:relative;overflow-x:hidden;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased;transition:background .2s ease,color .2s ease;}
body::before{content:none;}
.droplet,.droplet::after{display:none !important;}
.glass-card{background:var(--surface);border-radius:12px;box-shadow:0 1px 2px rgba(16,24,40,0.05);border:1px solid var(--line);}
.glass-sidebar{background:var(--surface);border-right:1px solid var(--line);position:relative;}
.glass-header{background:var(--surface);border-bottom:1px solid var(--line);position:relative;}
.nav-glass-item{background:transparent;border:1px solid transparent;cursor:pointer;user-select:none;border-radius:8px;color:var(--muted);}
.nav-glass-item:hover{background:var(--surface2);color:var(--ink);}
.nav-active{background:var(--p1) !important;border:1px solid var(--p1) !important;box-shadow:0 1px 2px var(--glow) !important;color:#fff !important;border-radius:8px !important;}
.nav-active:hover{background:var(--p2) !important;color:#fff !important;}
.clay-card{background:var(--surface);box-shadow:0 1px 2px rgba(16,24,40,0.05);border:1px solid var(--line);color:var(--ink);}
.btn-premium{background:var(--p1);color:#fff !important;box-shadow:0 1px 2px var(--glow);border:1px solid var(--p1);cursor:pointer;}
.btn-premium:hover{background:var(--p2);border-color:var(--p2);}
input,select,textarea{border-radius:8px !important;}
html[data-mode="dark"] input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]),html[data-mode="dark"] select,html[data-mode="dark"] textarea{background:var(--input);border-color:var(--line);color:var(--ink);}
html[data-mode="dark"] input::placeholder,html[data-mode="dark"] textarea::placeholder{color:var(--faint);}
.feature-card{background:var(--surface);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;cursor:pointer;border:1px solid var(--line);color:var(--ink);}
.feature-card input[type=checkbox]{width:20px !important;height:20px !important;accent-color:var(--p1);flex-shrink:0;}
.feature-card.checked{background:var(--surface2);border-color:var(--p1);}
.custom-select{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='3' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 16px center;padding-right:44px !important;cursor:pointer;}
.dual-tab-container{display:inline-flex;background:var(--surface);border-radius:12px;padding:4px;border:1px solid var(--line);box-shadow:0 1px 2px rgba(16,24,40,0.05);}
.dual-tab-btn{padding:10px 24px;border-radius:8px;font-weight:600;font-size:14px;color:var(--muted);cursor:pointer;border:none;background:transparent;}
.dual-tab-btn.active-mundo{background:var(--p1);color:#fff;box-shadow:0 1px 2px var(--glow);}
.dual-tab-btn.active-bcore{background:#1E293B;color:#fff;box-shadow:0 1px 2px rgba(16,24,40,0.2);}
html[data-mode="dark"] .dual-tab-btn.active-bcore{background:#E9ECF1;color:#12151B;}
.tab-content-panel{display:none;}
.tab-content-panel.active{display:block;}
::-webkit-scrollbar{width:8px;height:8px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:10px;}
html[data-mode="dark"] ::-webkit-scrollbar-thumb{background:#2E3742;}
.mode-btn{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--muted);cursor:pointer;}
.mode-btn:hover{color:var(--ink);background:var(--surface2);}
.mode-btn .ic-sun{display:none;}
html[data-mode="dark"] .mode-btn .ic-sun{display:inline;}
html[data-mode="dark"] .mode-btn .ic-moon{display:none;}
.auth-dots{background-image:radial-gradient(var(--line) 1px,transparent 1px);background-size:22px 22px;}
.status-dot{width:8px;height:8px;border-radius:999px;background:#10B981;box-shadow:0 0 0 4px rgba(16,185,129,0.15);flex-shrink:0;}
.auth-card{box-shadow:0 12px 32px rgba(16,24,40,0.10);}
.side-label{padding:18px 12px 6px;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--faint);}
.side-divider{margin:14px 8px 2px;border-top:1px solid var(--line);}
.avatar-premium{background:var(--p1);box-shadow:0 1px 2px var(--glow);}
.brand-text{background:var(--p1);-webkit-background-clip:text;background-clip:text;color:transparent;}
.back-link{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;font-weight:700;margin-bottom:16px;background:var(--surface);border:1px solid var(--line);color:var(--muted);font-size:14px;}
.back-link:hover{color:var(--ink);background:var(--surface2);}
.pill{padding:10px 14px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;border:1px solid var(--line);background:var(--surface);color:var(--muted);text-align:center;transition:all 0.2s;}
.pill.on{background:var(--p1);color:#fff;border-color:var(--p1);box-shadow:0 1px 2px var(--glow);}
.stepper{display:flex;align-items:center;gap:10px;}
.stepper button{width:42px;height:42px;border-radius:10px;font-size:20px;font-weight:900;line-height:1;background:var(--surface);border:1px solid var(--line);color:var(--ink);}
.costbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-radius:12px;background:var(--surface2);border:1px solid var(--line);}
.theme-swatch{height:64px;border-radius:12px;margin-bottom:10px;border:1px solid var(--line);}
.sw{position:relative;width:60px;height:32px;flex-shrink:0;display:inline-block;}
/* ===== dark-mode remap for hardcoded content utilities (templates untouched) ===== */
html[data-mode="dark"] .bg-white{background-color:var(--surface) !important;}
html[data-mode="dark"] .bg-slate-50{background-color:var(--surface2) !important;}
html[data-mode="dark"] .bg-slate-100{background-color:#232A34 !important;}
html[data-mode="dark"] .bg-emerald-50{background-color:rgba(16,185,129,0.14) !important;}
html[data-mode="dark"] .bg-red-50{background-color:rgba(239,68,68,0.14) !important;}
html[data-mode="dark"] .bg-amber-50{background-color:rgba(245,158,11,0.15) !important;}
html[data-mode="dark"] .bg-purple-50{background-color:rgba(139,92,246,0.16) !important;}
html[data-mode="dark"] .bg-blue-50{background-color:rgba(59,130,246,0.16) !important;}
html[data-mode="dark"] .bg-indigo-50{background-color:rgba(99,102,241,0.16) !important;}
html[data-mode="dark"] .text-slate-800{color:#E9ECF1 !important;}
html[data-mode="dark"] .text-slate-700{color:#D4D9E0 !important;}
html[data-mode="dark"] .text-slate-600{color:#B7BEC9 !important;}
html[data-mode="dark"] .text-slate-500{color:#9AA3B2 !important;}
html[data-mode="dark"] .text-slate-400{color:#7C8594 !important;}
html[data-mode="dark"] .text-slate-300{color:#8A93A1 !important;}
html[data-mode="dark"] .text-blue-700{color:#93B4FD !important;}
html[data-mode="dark"] .text-blue-600{color:#7AA2F7 !important;}
html[data-mode="dark"] .text-indigo-700{color:#A5B4FC !important;}
html[data-mode="dark"] .text-emerald-700{color:#6EE7B7 !important;}
html[data-mode="dark"] .text-emerald-600,html[data-mode="dark"] .text-emerald-500{color:#34D399 !important;}
html[data-mode="dark"] .text-red-700{color:#FCA5A5 !important;}
html[data-mode="dark"] .text-red-600,html[data-mode="dark"] .text-red-500{color:#F87171 !important;}
html[data-mode="dark"] .text-amber-700{color:#FCD34D !important;}
html[data-mode="dark"] .text-amber-600,html[data-mode="dark"] .text-amber-500{color:#FBBF24 !important;}
html[data-mode="dark"] .text-purple-700{color:#DDD6FE !important;}
html[data-mode="dark"] .text-purple-600,html[data-mode="dark"] .text-purple-500{color:#C4B5FD !important;}
html[data-mode="dark"] .text-pink-500{color:#F9A8D4 !important;}
html[data-mode="dark"] .border-slate-200{border-color:#242C37 !important;}
html[data-mode="dark"] .border-indigo-200{border-color:#3730A3 !important;}
html[data-mode="dark"] .border-blue-200,html[data-mode="dark"] .border-blue-100{border-color:#1E3A8A !important;}
html[data-mode="dark"] .border-red-200{border-color:#7F1D1D !important;}
html[data-mode="dark"] .border-emerald-200{border-color:#065F46 !important;}
html[data-mode="dark"] .border-amber-100{border-color:#44403C !important;}
html[data-mode="dark"] .hover\\:bg-slate-50:hover{background-color:#1A2029 !important;}
html[data-mode="dark"] .hover\\:bg-slate-100:hover{background-color:#232A34 !important;}
html[data-mode="dark"] .hover\\:bg-red-50:hover{background-color:rgba(239,68,68,0.14) !important;}
/* indigo hero banners stay indigo in both modes */
.avatar-premium .text-white,.avatar-premium .text-white\/70,.avatar-premium .text-white\/75,.avatar-premium .text-white\/80{color:#fff !important;}
.avatar-premium .bg-white\/10{background-color:rgba(255,255,255,0.10) !important;}
.avatar-premium .bg-white\/20{background-color:rgba(255,255,255,0.20) !important;}
.avatar-premium .border-white\/20,.avatar-premium .border-white\/30{border-color:rgba(255,255,255,0.25) !important;}
.sw input{opacity:0;width:0;height:0;}
.sw .tr{position:absolute;inset:0;border-radius:999px;background:rgba(148,163,184,0.45);transition:.3s;cursor:pointer;}
.sw .tr:before{content:'';position:absolute;width:26px;height:26px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.3s;box-shadow:0 2px 6px rgba(0,0,0,0.25);}
.sw input:checked + .tr{background:var(--p1);}
.sw input:checked + .tr:before{transform:translateX(28px);}
.inp-icon{position:relative;}
.inp-icon > i{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#94A3B8;}
.inp-icon > input{padding-left:40px !important;}
/* ===== v3 layout: sidebar nav tiles, page heads, tables, chips ===== */
.nav-glass-item i.bi{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;background:var(--surface2);border:1px solid var(--line);border-radius:9px;font-size:15px;flex-shrink:0;}
.nav-active i.bi{background:rgba(255,255,255,0.20);border-color:transparent;}
.pagehead{display:flex;align-items:center;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:20px;box-shadow:0 1px 2px rgba(16,24,40,0.05);}
.pagehead h1{font-size:20px;font-weight:800;letter-spacing:-0.01em;color:var(--ink);}
.pagehead p{font-size:13px;color:var(--muted);margin-top:2px;}
.ph-ic{width:46px;height:46px;border-radius:12px;background:var(--p1);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;box-shadow:0 1px 2px var(--glow);}
.tbl-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 1px 2px rgba(16,24,40,0.05);}
.tbl{width:100%;min-width:780px;border-collapse:collapse;font-size:13px;}
.tbl th{text-align:left;font-size:10.5px;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--muted);padding:10px 14px;border-bottom:1px solid var(--line);background:var(--surface2);white-space:nowrap;}
.tbl td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:middle;color:var(--ink);}
.tbl tbody tr:last-child td{border-bottom:none;}
.tbl tbody tr:hover td{background:var(--surface2);}
.tbl .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;font-weight:600;}
.meter{height:6px;border-radius:999px;background:var(--surface2);border:1px solid var(--line);overflow:hidden;min-width:90px;}
.meter > div{height:100%;background:var(--p1);border-radius:999px;}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
.toolbar .grow{flex:1;min-width:200px;}
.chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:0.02em;white-space:nowrap;}
.chip::before{content:'';width:6px;height:6px;border-radius:999px;background:currentColor;}
.chip-g{background:rgba(16,185,129,0.13);color:#059669;}
.chip-r{background:rgba(239,68,68,0.12);color:#DC2626;}
.chip-a{background:rgba(245,158,11,0.15);color:#B45309;}
.chip-i{background:rgba(79,70,229,0.12);color:var(--p1);}
.chip-n{background:var(--surface2);color:var(--muted);}
html[data-mode="dark"] .chip-g{color:#34D399;}
html[data-mode="dark"] .chip-r{color:#F87171;}
html[data-mode="dark"] .chip-a{color:#FBBF24;}
html[data-mode="dark"] .chip-i{color:#A5B4FC;}
.live-pill{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:var(--surface2);border:1px solid var(--line);font-size:12px;font-weight:700;color:var(--muted);white-space:nowrap;}
.kpi-label{font-size:11px;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--muted);}
.kpi-val{font-size:30px;font-weight:800;letter-spacing:-0.02em;color:var(--ink);margin-top:4px;}
.kpi-foot{font-size:12px;color:var(--muted);margin-top:4px;}
.row-actions{display:flex;gap:6px;flex-wrap:wrap;}
.mini-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700;border:1px solid var(--line);background:var(--surface);color:var(--muted);cursor:pointer;white-space:nowrap;}
.mini-btn:hover{color:var(--ink);background:var(--surface2);}
.mini-btn.danger{color:#DC2626;}
html[data-mode="dark"] .mini-btn.danger{color:#F87171;}
.mini-btn.accent{color:var(--p1);border-color:var(--p1);}
.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--muted);cursor:pointer;flex-shrink:0;}
.icon-btn:hover{color:var(--ink);background:var(--surface2);}
/* ===== overflow guards: nothing escapes its card ===== */
.glass-card,.clay-card,.pagehead,.tbl-wrap,.toolbar{min-width:0;}
.glass-card{overflow:hidden;}
code,.mono{overflow-wrap:anywhere;}
.tbl{min-width:680px;}
.tbl td{overflow-wrap:anywhere;}
.tbl .mono{word-break:break-all;}
.pagehead{flex-wrap:wrap;row-gap:12px;}
.kpi-val{font-size:clamp(22px,5vw,30px);overflow-wrap:anywhere;}
.chip{max-width:100%;}
/* ===== frosted key card: blurred key behind glass, punched corners ===== */
.keycard{position:relative;display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(135deg,rgba(79,70,229,0.10),rgba(79,70,229,0.02) 60%),var(--surface);backdrop-filter:blur(10px) saturate(140%);-webkit-backdrop-filter:blur(10px) saturate(140%);
  -webkit-mask:radial-gradient(circle 7px at 0 0,transparent 7px,#000 7.5px),radial-gradient(circle 7px at 100% 0,transparent 7px,#000 7.5px),radial-gradient(circle 7px at 0 100%,transparent 7px,#000 7.5px),radial-gradient(circle 7px at 100% 100%,transparent 7px,#000 7.5px);
  -webkit-mask-composite:source-in;
  mask:radial-gradient(circle 7px at 0 0,transparent 7px,#000 7.5px),radial-gradient(circle 7px at 100% 0,transparent 7px,#000 7.5px),radial-gradient(circle 7px at 0 100%,transparent 7px,#000 7.5px),radial-gradient(circle 7px at 100% 100%,transparent 7px,#000 7.5px);
  mask-composite:intersect;}
html[data-mode="dark"] .keycard{background:linear-gradient(135deg,rgba(99,102,241,0.18),rgba(99,102,241,0.05) 60%),var(--surface);}
.keycard .mono{flex:1;min-width:0;word-break:break-all;}
`;

export const BASE_JS = `
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('-translate-x-full');document.getElementById('sidebar-overlay').classList.toggle('hidden');}
function arcMode(){try{return localStorage.getItem('arc-mode')||'light';}catch(e){return 'light';}}
function arcSetMode(m){try{localStorage.setItem('arc-mode',m);}catch(e){}document.documentElement.setAttribute('data-mode',m);}
function arcToggleMode(){arcSetMode(arcMode()==='dark'?'light':'dark');}
function switchDualTab(containerId,tabName){const container=document.getElementById(containerId);if(!container)return;const wrapper=container.closest('.dual-tab-wrapper');if(!wrapper)return;const buttons=wrapper.querySelectorAll('.dual-tab-btn');const panels=wrapper.querySelectorAll('.tab-content-panel');buttons.forEach(b=>b.classList.remove('active-mundo','active-bcore'));panels.forEach(p=>p.classList.remove('active'));const ab=wrapper.querySelector('.dual-tab-btn[data-tab="'+tabName+'"]');const ap=wrapper.querySelector('.tab-content-panel[data-tab="'+tabName+'"]');if(ab)ab.classList.add(tabName==='mundo'?'active-mundo':'active-bcore');if(ap)ap.classList.add('active');try{localStorage.setItem('sdkTab_'+wrapper.id,tabName);}catch(e){}}
document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('.dual-tab-wrapper').forEach(function(w){let saved='mundo';try{saved=localStorage.getItem('sdkTab_'+w.id)||'mundo';}catch(e){}const btn=w.querySelector('.dual-tab-btn[data-tab="'+saved+'"]')||w.querySelector('.dual-tab-btn');if(!btn)return;const tab=btn.getAttribute('data-tab');w.querySelectorAll('.dual-tab-btn').forEach(b=>b.classList.remove('active-mundo','active-bcore'));w.querySelectorAll('.tab-content-panel').forEach(p=>p.classList.remove('active'));btn.classList.add(tab==='mundo'?'active-mundo':'active-bcore');const p=w.querySelector('.tab-content-panel[data-tab="'+tab+'"]');if(p)p.classList.add('active');});});
function doCopy(text,btn){const ok=function(){if(!btn)return;const ic=btn.querySelector('i');if(!ic)return;const old=ic.className;ic.className='bi bi-check2 text-emerald-500';setTimeout(function(){ic.className=old;},1500);};if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(ok).catch(function(){fb(text,ok);});}else{fb(text,ok);}}
function fb(text,cb){const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');cb&&cb();}catch(e){}document.body.removeChild(ta);}
function copyUrl(id,btn){const el=document.getElementById(id);if(el)doCopy(el.innerText.trim(),btn);}
`;

// Runs in <head> before paint: applies saved light/dark mode with no flash.
export const MODE_EARLY = `<script>(function(){try{var m=localStorage.getItem('arc-mode');if(m==='dark'){document.documentElement.setAttribute('data-mode','dark');}}catch(e){}})();</script>`;

// Standalone toggle for pages without BASE_JS (login/register/etc).
export const MODE_STANDALONE = `<script>function arcToggleMode(){try{var m=localStorage.getItem('arc-mode')==='dark'?'light':'dark';localStorage.setItem('arc-mode',m);document.documentElement.setAttribute('data-mode',m);}catch(e){}}</script>`;

// Header / floating light-dark toggle button.
export const MODE_BTN = '<button onclick="arcToggleMode()" class="mode-btn" aria-label="Toggle light or dark mode" title="Light / dark"><i class="bi bi-moon-stars-fill ic-moon"></i><i class="bi bi-sun-fill ic-sun"></i></button>';

// Small sidebar section label.
export const sideLabel = (t) => '<div class="side-label">' + esc(t) + '</div>';

export function layout(o) {
  const { title, route, username, panelCode, panelName, content, theme } = o;
  const th = theme || 'blue';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<title>' + esc(title) + ' - ' + esc(panelName) + '</title>'
    + '<script src="https://cdn.tailwindcss.com"></script>'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
    + '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">'
    + '<style>' + CSS + '</style>' + MODE_EARLY + '</head>'
    + '<body class="flex h-screen overflow-hidden relative" data-theme="' + esc(th) + '">'
    + '<div class="droplet drop-1"></div><div class="droplet drop-2"></div><div class="droplet drop-3"></div><div class="droplet drop-4"></div><div class="droplet drop-5"></div><div class="droplet drop-6"></div><div class="droplet drop-7"></div><div class="droplet drop-8"></div>'
    + '<div id="sidebar-overlay" onclick="toggleSidebar()" class="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 hidden md:hidden"></div>'
    + '<aside id="sidebar" class="w-[264px] shrink-0 glass-sidebar flex flex-col absolute inset-y-0 left-0 transform -translate-x-full md:relative md:translate-x-0 transition-transform duration-300 z-50">'
    + '<div class="px-5 pt-6 pb-5"><div class="flex items-center gap-3">'
    + '<div class="w-10 h-10 shrink-0 rounded-xl avatar-premium text-white flex items-center justify-center text-lg shadow"><i class="bi bi-boxes"></i></div>'
    + '<div class="flex-1 min-w-0"><p class="truncate text-[15px] font-extrabold tracking-tight" style="color:var(--ink)">' + esc(panelName) + '</p>'
    + '<p class="font-mono text-[11px] truncate" style="color:var(--muted)">' + esc(panelCode) + ' · SDK</p></div>'
    + '<button onclick="toggleSidebar()" class="md:hidden text-2xl" style="color:var(--muted)" aria-label="Close menu"><i class="bi bi-x-lg"></i></button></div></div>'
    + '<nav class="flex-1 px-3 pb-4 overflow-y-auto" aria-label="SDK">'
    + sideLabel('SDK Panel')
    + '<a href="/dashboard" class="back-link"><i class="bi bi-arrow-left-short text-2xl"></i><span>Back to Main Panel</span></a>'
    + '<a href="/sdk" class="' + navClass('sdk', route) + '"><i class="bi bi-speedometer2 text-lg w-6 text-center"></i> Dashboard</a>'
    + '<a href="/sdk/generate" class="' + navClass('sdk/generate', route) + '"><i class="bi bi-key-fill text-lg w-6 text-center"></i> Generate SDK</a>'
    + '<a href="/sdk/keys" class="' + navClass('sdk/keys', route) + '"><i class="bi bi-view-list text-lg w-6 text-center"></i> SDK Keys</a>'
    + '<a href="/sdk/server" class="' + navClass('sdk/server', route) + '"><i class="bi bi-hdd-network-fill text-lg w-6 text-center"></i> Server</a>'
    + '<a href="/sdk/hash" class="' + navClass('sdk/hash', route) + '"><i class="bi bi-fingerprint text-lg w-6 text-center"></i> Hash</a>'
    + '</nav><div class="p-3"><div class="clay-card rounded-xl p-3 flex items-center gap-2.5"><span class="status-dot"></span><div class="min-w-0"><p class="text-xs font-bold" style="color:var(--ink)">Engines live</p><p class="text-[11px] truncate" style="color:var(--muted)">Mundo + Bcore</p></div></div></div></aside>'
    + '<div class="flex-1 flex flex-col h-screen overflow-y-auto relative w-full z-10">'
    + '<header class="glass-header sticky top-0 z-30"><div class="flex items-center gap-3 px-4 lg:px-8 h-16">'
    + '<button onclick="toggleSidebar()" class="md:hidden mode-btn" aria-label="Open menu"><i class="bi bi-list text-xl"></i></button>'
    + '<div class="min-w-0"><p class="font-mono text-[11px] truncate" style="color:var(--muted)">SDK Panel <span style="color:var(--faint)">/</span> ' + esc(panelCode) + '</p>'
    + '<h1 class="truncate text-base md:text-lg font-extrabold tracking-tight" style="color:var(--ink)">' + esc(title) + '</h1></div>'
    + '<div class="ml-auto hidden md:inline-flex items-center gap-2"><span class="live-pill"><span class="status-dot"></span>Live</span></div><div class="ml-auto md:ml-0 flex items-center gap-2">' + MODE_BTN
    + '<div class="hidden sm:flex flex-col items-end mr-1"><span class="text-sm font-bold" style="color:var(--ink)">' + esc(username) + '</span><span class="text-[10px] font-extrabold tracking-widest uppercase" style="color:var(--p1)">OWNER</span></div>'
    + '<div class="relative group"><div class="w-10 h-10 rounded-xl avatar-premium text-white flex items-center justify-center font-bold text-base cursor-pointer">' + esc(String(username || 'A').substring(0, 1).toUpperCase()) + '</div>'
    + '<div class="absolute right-0 mt-3 w-52 rounded-xl overflow-hidden bg-white border border-slate-200 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all"><div class="p-3"><a href="/logout" class="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-xl font-medium"><i class="bi bi-box-arrow-right"></i> Sign Out</a></div></div>'
    + '</div></div></div></header>'
    + '<main class="p-4 md:p-8 pb-20 relative z-10"><div class="mx-auto w-full max-w-6xl">' + content + '</div></main></div>'
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
    + '<style>' + CSS + '</style>' + MODE_EARLY + MODE_STANDALONE + '</head>'
    + '<body class="auth-dots" style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px;">'
    + '<div class="fixed top-4 right-4 z-50">' + MODE_BTN + '</div>'
    + '<div class="droplet drop-1"></div><div class="droplet drop-2"></div><div class="droplet drop-3"></div><div class="droplet drop-4"></div><div class="droplet drop-5"></div>'
    + '<div class="w-full max-w-[400px] relative z-10"><div class="text-center mb-5"><div class="w-14 h-14 rounded-2xl avatar-premium flex items-center justify-center text-xl text-white mx-auto mb-2"><i class="bi bi-shield-lock-fill"></i></div>'
    + '<h1 class="text-lg font-black"><span class="brand-text">' + esc(panelName) + '</span></h1></div>'
    + '<div class="glass-card auth-card p-6"><div class="text-center mb-5"><h2 class="text-base font-black text-slate-800">' + (isSetup ? 'Setup Admin' : 'Welcome Back') + '</h2><p class="text-xs text-slate-500">SDK Panel - Mundo + Bcore</p></div>' + inner + '</div></div></body></html>';
}
