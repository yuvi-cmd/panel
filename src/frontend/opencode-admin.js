// Standalone OpenCode control-plane UI.
//
// This is intentionally *not* the SDK panel layout. It has its own dark
// control-plane sidebar, its own login page, and its own navigation. The SDK
// owner link (/opencode in panel-ui.js) opens this same standalone surface.

import { CSS, MODE_BTN, MODE_EARLY, MODE_STANDALONE, esc } from './ui.js';
import { assetHead, assetTail } from './asset-head.js';

const OCSS = `
.oc-body{background:var(--bg);}
.oc-side{position:fixed;inset:0 auto 0 0;width:268px;background:linear-gradient(180deg,#0B1220 0%,#0F172A 55%,#0A101C 100%);color:#DDE3EE;display:flex;flex-direction:column;z-index:60;border-right:1px solid rgba(148,163,184,.14);}
.oc-brand{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(148,163,184,.12);}
.oc-logo{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#2DD4BF,#6366F1);display:flex;align-items:center;justify-content:center;color:#06121D;font-size:20px;box-shadow:0 10px 24px rgba(45,212,191,.25);flex-shrink:0;}
.oc-brand-name{font-size:16px;font-weight:900;letter-spacing:-.02em;color:#F8FAFC;line-height:1.1;}
.oc-brand-sub{font-size:9.5px;font-weight:800;letter-spacing:.18em;color:#5EEAD4;margin-top:3px;}
.oc-nav{padding:14px 12px;flex:1;overflow-y:auto;}
.oc-sec{font-size:9.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#64748B;padding:16px 12px 7px;}
.oc-link{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;color:#9FB0C7;font-size:13px;font-weight:600;transition:background .15s,color .15s;margin-bottom:3px;text-decoration:none;}
.oc-link:hover{background:rgba(148,163,184,.10);color:#F1F5F9;}
.oc-link.active{background:rgba(45,212,191,.12);color:#99F6E4;box-shadow:inset 3px 0 0 #2DD4BF;}
.oc-link i{font-size:16px;width:22px;text-align:center;}
.oc-link .oc-badge{margin-left:auto;font-size:9px;font-weight:800;padding:2px 6px;border-radius:999px;background:rgba(148,163,184,.14);color:#94A3B8;}
.oc-apirow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 12px;font-size:10.5px;color:#64748B;}
.oc-apirow code{font-size:10px;color:#94A3B8;background:rgba(15,23,42,.8);padding:2px 6px;border-radius:5px;}
.oc-side-foot{padding:12px;border-top:1px solid rgba(148,163,184,.12);}
.oc-enc{display:flex;align-items:center;gap:9px;padding:10px 11px;border-radius:10px;background:rgba(15,23,42,.65);border:1px solid rgba(148,163,184,.14);margin-bottom:8px;}
.oc-dot{width:8px;height:8px;border-radius:99px;flex-shrink:0;background:#F59E0B;box-shadow:0 0 0 3px rgba(245,158,11,.15);}
.oc-dot.on{background:#34D399;box-shadow:0 0 0 3px rgba(52,211,153,.15);}
.oc-enc p{font-size:10.5px;font-weight:700;color:#CBD5E1;line-height:1.3;}
.oc-enc span{font-size:9.5px;color:#64748B;}
.oc-signout{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;padding:9px;border-radius:9px;background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.20);color:#FCA5A5;font-size:11.5px;font-weight:800;text-decoration:none;}
.oc-signout:hover{background:rgba(239,68,68,.16);}
.oc-backpanel{display:flex;align-items:center;gap:9px;width:100%;padding:9px 11px;margin-bottom:8px;border-radius:9px;background:rgba(99,102,241,.12);border:1px solid rgba(129,140,248,.28);color:#C7D2FE;font-size:11.5px;font-weight:800;letter-spacing:.02em;text-decoration:none;transition:background .15s,border-color .15s;}
.oc-backpanel:hover{background:rgba(99,102,241,.22);border-color:rgba(165,180,252,.48);color:#E0E7FF;}
.oc-backpanel i{font-size:15px;width:22px;text-align:center;}
.oc-backpanel .oc-backpanel-arrow{margin-left:auto;font-size:13px;width:auto;color:#A5B4FC;}
.oc-main{flex:1;min-width:0;margin-left:268px;}
.oc-top{position:sticky;top:0;z-index:40;display:flex;align-items:center;gap:14px;padding:12px 24px;background:var(--surface);border-bottom:1px solid var(--line);}
.oc-menu{display:none;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer;flex-shrink:0;}
.oc-crumb{font-size:10px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;color:var(--muted);}
.oc-crumb span{color:var(--faint);}
.oc-title{font-size:17px;font-weight:900;letter-spacing:-.02em;color:var(--ink);line-height:1.2;}
.oc-top-actions{margin-left:auto;display:flex;align-items:center;gap:9px;}
.oc-live{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;background:var(--surface2);border:1px solid var(--line);font-size:10px;font-weight:800;color:var(--muted);white-space:nowrap;}
.oc-live::before{content:'';width:6px;height:6px;border-radius:99px;background:#10B981;box-shadow:0 0 0 2px rgba(16,185,129,.16);}
.oc-actor{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;background:rgba(99,102,241,.10);border:1px solid rgba(99,102,241,.20);font-size:10px;font-weight:800;color:var(--acc-d);white-space:nowrap;}
html[data-mode="dark"] .oc-actor{color:#C7D2FE;}
.oc-top-logout{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:9px;border:1px solid var(--line);background:var(--surface);color:var(--muted);font-size:11px;font-weight:800;text-decoration:none;white-space:nowrap;}
.oc-top-logout:hover{color:var(--danger-tx);border-color:var(--danger-line);background:var(--danger-bg);}
.oc-top-back{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:9px;border:1px solid rgba(99,102,241,.35);background:rgba(99,102,241,.08);color:#4F46E5;font-size:11px;font-weight:800;text-decoration:none;white-space:nowrap;transition:background .15s,border-color .15s;}
.oc-top-back:hover{background:rgba(99,102,241,.16);border-color:rgba(99,102,241,.55);}
html[data-mode="dark"] .oc-top-back{color:#C7D2FE;border-color:rgba(165,180,252,.32);background:rgba(99,102,241,.14);}
html[data-mode="dark"] .oc-top-back:hover{background:rgba(99,102,241,.24);}
.oc-content{padding:24px;max-width:1280px;margin:0 auto;}
.oc-overlay{display:none;position:fixed;inset:0;background:rgba(2,6,23,.55);backdrop-filter:blur(3px);z-index:55;}
.oc-alert{display:flex;align-items:flex-start;gap:9px;padding:12px 14px;border-radius:11px;font-size:12.5px;font-weight:700;margin-bottom:16px;border:1px solid;}
.oc-alert.ok{background:var(--ok-bg);border-color:var(--ok-line);color:var(--ok-tx);}
.oc-alert.err{background:var(--danger-bg);border-color:var(--danger-line);color:var(--danger-tx);}
.oc-hero{position:relative;overflow:hidden;display:flex;align-items:center;gap:24px;padding:26px;border-radius:18px;margin-bottom:16px;border:1px solid rgba(148,163,184,.16);background:linear-gradient(120deg,#0B1220,#111C2E 58%,#0C2530);color:#F8FAFC;box-shadow:0 18px 40px rgba(2,6,23,.16);}
.oc-hero::after{content:'';position:absolute;width:360px;height:360px;right:-140px;top:-180px;border-radius:50%;background:radial-gradient(circle,rgba(45,212,191,.20),transparent 68%);pointer-events:none;}
.oc-hero.is-off{background:linear-gradient(120deg,#1C0F14,#251318 58%,#2A1A0C);}
.oc-hero.is-off::after{background:radial-gradient(circle,rgba(245,158,11,.16),transparent 68%);}
.oc-hero-main{position:relative;z-index:1;flex:1;min-width:0;}
.oc-eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:9.5px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#5EEAD4;}
.oc-hero.is-off .oc-eyebrow{color:#FCD34D;}
.oc-eyebrow::before{content:'';width:7px;height:7px;border-radius:99px;background:currentColor;box-shadow:0 0 0 3px rgba(45,212,191,.15);}
.oc-hero h2{font-size:clamp(22px,4vw,30px);font-weight:900;letter-spacing:-.03em;margin-top:8px;color:#F8FAFC;}
.oc-hero p{font-size:12.5px;line-height:1.6;color:#9FB0C7;margin-top:6px;max-width:620px;}
.oc-hero-actions{position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-end;gap:9px;flex-shrink:0;}
.oc-switch-state{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:900;letter-spacing:.10em;color:#99F6E4;}
.oc-hero.is-off .oc-switch-state{color:#FCD34D;}
.oc-switch-state::before{content:'';width:7px;height:7px;border-radius:99px;background:currentColor;}
.oc-hero-btn{display:inline-flex;align-items:center;gap:8px;padding:11px 15px;border-radius:10px;font-size:12px;font-weight:900;border:1px solid transparent;cursor:pointer;white-space:nowrap;}
.oc-hero-btn.off{background:rgba(239,68,68,.14);border-color:rgba(248,113,113,.30);color:#FCA5A5;}
.oc-hero-btn.off:hover{background:rgba(239,68,68,.22);}
.oc-hero-btn.on{background:#2DD4BF;border-color:#2DD4BF;color:#052E2B;}
.oc-hero-btn.on:hover{background:#5EEAD4;}
.oc-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:16px;}
.oc-stat{display:flex;align-items:center;gap:11px;padding:13px 14px;}
.oc-stat-ic{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;background:var(--surface2);color:var(--muted);}
.oc-stat-ic.green{background:rgba(16,185,129,.12);color:#059669;}
.oc-stat-ic.amber{background:rgba(245,158,11,.14);color:#B45309;}
.oc-stat-ic.red{background:rgba(239,68,68,.11);color:#DC2626;}
.oc-stat-ic.blue{background:rgba(59,130,246,.12);color:#2563EB;}
html[data-mode="dark"] .oc-stat-ic.green{color:#34D399;}
html[data-mode="dark"] .oc-stat-ic.amber{color:#FBBF24;}
html[data-mode="dark"] .oc-stat-ic.red{color:#F87171;}
html[data-mode="dark"] .oc-stat-ic.blue{color:#93C5FD;}
.oc-kpi-label{font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}
.oc-kpi-val{font-size:22px;font-weight:900;letter-spacing:-.03em;color:var(--ink);line-height:1.1;margin-top:2px;}
.oc-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;}
.oc-panel{padding:17px;}
.oc-panel-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;}
.oc-panel-head h3{font-size:13.5px;font-weight:900;color:var(--ink);letter-spacing:-.01em;}
.oc-panel-head p{font-size:10.5px;color:var(--muted);margin-top:2px;line-height:1.5;}
.oc-panel-head .mini-btn{margin-left:auto;}
.oc-label{display:block;font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:5px;}
.oc-input,.oc-ta{width:100%;background:var(--surface2);border:1px solid var(--line);border-radius:9px;padding:9px 11px;font-size:12px;font-weight:600;color:var(--ink);outline:none;}
.oc-ta{resize:vertical;min-height:64px;}
.oc-input:focus,.oc-ta:focus{border-color:var(--acc);box-shadow:0 0 0 3px var(--acc-soft);}
.oc-toggle{display:flex;align-items:center;gap:10px;padding:10px 11px;border:1px solid var(--line);background:var(--surface2);border-radius:10px;cursor:pointer;position:relative;margin-bottom:10px;}
.oc-toggle p{font-size:11.5px;font-weight:800;color:var(--ink);line-height:1.25;}
.oc-toggle small{display:block;font-size:9.5px;color:var(--muted);font-weight:600;margin-top:1px;}
.oc-toggle input{position:absolute;opacity:0;width:0;height:0;}
.oc-track{width:38px;height:22px;border-radius:99px;background:#CBD5E1;position:relative;margin-left:auto;flex-shrink:0;transition:background .15s;}
.oc-track::after{content:'';position:absolute;width:16px;height:16px;border-radius:99px;background:#fff;left:3px;top:3px;transition:transform .15s;box-shadow:0 1px 3px rgba(2,6,23,.24);}
.oc-toggle input:checked + .oc-track{background:#10B981;}
.oc-toggle input:checked + .oc-track::after{transform:translateX(16px);}
.oc-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 14px;border-radius:9px;font-size:11.5px;font-weight:900;border:1px solid var(--acc);background:var(--acc);color:#fff;cursor:pointer;}
.oc-btn:hover{background:var(--acc-d);border-color:var(--acc-d);}
.oc-btn-ghost{background:var(--surface);border-color:var(--line);color:var(--muted);}
.oc-btn-ghost:hover{background:var(--surface2);color:var(--ink);border-color:var(--faint);}
.oc-btn-block{width:100%;}
.oc-search{display:flex;align-items:center;gap:7px;min-width:220px;}
.oc-search i{color:var(--faint);font-size:13px;}
.oc-search input{flex:1;min-width:0;background:var(--surface2);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:11.5px;font-weight:600;color:var(--ink);outline:none;}
.oc-search button{border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:8px 10px;color:var(--muted);cursor:pointer;}
.oc-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
.oc-toolbar .oc-search{margin-left:auto;}
.oc-summary{display:flex;gap:6px;flex-wrap:wrap;}
.oc-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;font-size:10px;font-weight:800;background:var(--surface2);border:1px solid var(--line);color:var(--muted);}
.oc-chip b{color:var(--ink);}
.oc-actions{display:flex;flex-wrap:wrap;gap:4px;align-items:center;}
.oc-actions input[type=number]{width:56px;padding:5px 6px;border-radius:6px;border:1px solid var(--line);background:var(--surface2);color:var(--ink);font-size:10.5px;font-weight:700;}
.oc-utc{font-size:8px;font-weight:800;color:var(--faint);}
.oc-muted{color:var(--muted);}
.oc-empty{padding:34px 18px;text-align:center;color:var(--muted);font-size:12px;font-weight:700;}
.oc-empty i{display:block;font-size:26px;color:var(--faint);margin-bottom:6px;}
.oc-notice{padding:13px 14px;border:1px solid var(--line);border-radius:11px;background:var(--surface2);margin-bottom:8px;}
.oc-notice-head{display:flex;align-items:center;gap:7px;margin-bottom:5px;}
.oc-notice h4{font-size:12px;font-weight:900;color:var(--ink);}
.oc-notice p{font-size:11px;line-height:1.55;color:var(--muted);white-space:pre-wrap;margin-top:4px;}
.oc-notice-meta{font-size:9px;font-weight:700;color:var(--faint);margin-top:6px;}
.oc-notice-actions{display:flex;gap:4px;margin-left:auto;}
.oc-status-card{display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface2);margin-bottom:8px;}
.oc-status-card i{font-size:16px;color:var(--muted);margin-top:1px;}
.oc-status-card p{font-size:11.5px;font-weight:800;color:var(--ink);}
.oc-status-card small{display:block;font-size:10px;color:var(--muted);line-height:1.5;margin-top:2px;overflow-wrap:anywhere;}
.oc-status-card .ok{color:#059669;}
.oc-status-card .warn{color:#B45309;}
.oc-code{background:#0B1220;color:#CBD5E1;border-radius:9px;padding:11px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;line-height:1.75;overflow-x:auto;border:1px solid #1E293B;}
.oc-code .c{color:#5EEAD4;}
.oc-link-inline{color:var(--acc);font-weight:800;text-decoration:none;}
.oc-login-body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:22px;background:radial-gradient(900px 600px at 12% 8%,rgba(45,212,191,.14),transparent 60%),radial-gradient(900px 700px at 92% 90%,rgba(99,102,241,.16),transparent 62%),#070B12;overflow-x:hidden;}
.oc-login-wrap{position:relative;z-index:1;width:100%;max-width:980px;display:grid;grid-template-columns:1.05fr .95fr;border-radius:22px;overflow:hidden;border:1px solid rgba(148,163,184,.18);box-shadow:0 34px 90px rgba(2,6,23,.55);}
.oc-login-brand{padding:34px;background:linear-gradient(150deg,#0B1220,#0F1B2C 62%,#0B2B2C);color:#E2E8F0;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden;}
.oc-login-brand::after{content:'';position:absolute;width:320px;height:320px;right:-140px;bottom:-150px;border-radius:50%;background:radial-gradient(circle,rgba(45,212,191,.22),transparent 68%);}
.oc-login-brand h1{font-size:clamp(26px,4vw,36px);font-weight:900;letter-spacing:-.04em;line-height:1.08;margin-top:20px;color:#F8FAFC;}
.oc-login-brand h1 span{color:#5EEAD4;}
.oc-login-brand p{font-size:12.5px;line-height:1.65;color:#9FB0C7;margin-top:12px;max-width:390px;}
.oc-login-feats{margin-top:22px;display:grid;gap:8px;position:relative;z-index:1;}
.oc-login-feat{display:flex;align-items:center;gap:9px;font-size:11.5px;font-weight:700;color:#CBD5E1;}
.oc-login-feat i{color:#2DD4BF;font-size:13px;}
.oc-login-card{background:var(--surface);padding:34px;display:flex;flex-direction:column;justify-content:center;}
.oc-login-card h2{font-size:20px;font-weight:900;letter-spacing:-.025em;color:var(--ink);}
.oc-login-card .sub{font-size:11.5px;color:var(--muted);margin-top:4px;line-height:1.55;}
.oc-login-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;background:rgba(45,212,191,.10);border:1px solid rgba(45,212,191,.22);font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#0F766E;margin-bottom:18px;width:fit-content;}
html[data-mode="dark"] .oc-login-badge{color:#5EEAD4;}
.oc-pw{position:relative;}
.oc-pw .oc-input{padding-right:40px;}
.oc-pw-btn{position:absolute;right:5px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:var(--faint);cursor:pointer;padding:6px;font-size:13px;}
.oc-hint{font-size:9.5px;line-height:1.55;color:var(--faint);margin-top:6px;}
.oc-setup{border:1px solid var(--line);background:var(--surface2);border-radius:10px;padding:13px;font-size:11px;color:var(--muted);line-height:1.6;}
.oc-setup-title{font-size:11.5px;font-weight:900;color:var(--ink);margin-bottom:4px;}
.oc-setup code{display:block;margin:8px 0;padding:8px 9px;border-radius:7px;background:#0B1220;color:#5EEAD4;font-size:10px;overflow-x:auto;}
.oc-login-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid var(--line);font-size:10px;font-weight:700;color:var(--muted);}
.oc-login-foot a{color:var(--acc);text-decoration:none;font-weight:800;}
@media(max-width:1023px){
  .oc-side{transform:translateX(-100%);transition:transform .22s ease;}
  .oc-side.open{transform:none;}
  .oc-overlay.show{display:block;}
  .oc-main{margin-left:0;}
  .oc-menu{display:inline-flex;}
  .oc-content{padding:16px;}
  .oc-top{padding:10px 14px;}
  .oc-stats{grid-template-columns:repeat(3,minmax(0,1fr));}
  .oc-login-wrap{grid-template-columns:1fr;max-width:520px;}
  .oc-login-brand{padding:26px;display:none;}
  .oc-login-card{padding:28px;}
}
@media(max-width:639px){
  .oc-hero{flex-direction:column;align-items:flex-start;padding:20px;gap:16px;}
  .oc-hero-actions{align-items:flex-start;width:100%;}
  .oc-hero-btn{width:100%;justify-content:center;}
  .oc-stats{grid-template-columns:repeat(2,minmax(0,1fr));}
  .oc-grid2{grid-template-columns:1fr;}
  .oc-top-actions .oc-live,.oc-top-actions .oc-actor{display:none;}
  .oc-toolbar .oc-search{width:100%;margin-left:0;}
  .oc-login-body{padding:12px;}
}
`;

const OC_JS = `
function ocSidebar(){var s=document.getElementById('ocSide');var o=document.getElementById('ocOverlay');if(!s)return;s.classList.toggle('open');if(o)o.classList.toggle('show');}
function ocTogglePw(){var i=document.getElementById('ocPw');if(!i)return;var b=document.querySelector('.oc-pw-btn i');if(i.type==='password'){i.type='text';if(b)b.className='bi bi-eye-slash';}else{i.type='password';if(b)b.className='bi bi-eye';}}
function ocConfirm(msg){return confirm(msg);}
document.addEventListener('keydown',function(e){if(e.key==='Escape'){var s=document.getElementById('ocSide');var o=document.getElementById('ocOverlay');if(s&&s.classList.contains('open')){s.classList.remove('open');if(o)o.classList.remove('show');}}});
`;

function flash(o) {
  const ok = o.ok
    ? '<div class="oc-alert ok"><i class="bi bi-check-circle-fill"></i><span>' + esc(o.ok) + '</span></div>'
    : '';
  const error = o.error
    ? '<div class="oc-alert err"><i class="bi bi-exclamation-circle-fill"></i><span>' + esc(o.error) + '</span></div>'
    : '';
  return ok + error;
}

function fmtTime(value) {
  return value
    ? esc(String(value)) + ' <span class="oc-utc">UTC</span>'
    : '<span class="oc-muted">—</span>';
}

function statusChip(status) {
  const label = status === 'active' ? 'Active' : status === 'pending' ? 'Pending' : status === 'expired' ? 'Expired' : 'Disabled';
  const cls = status === 'active' ? 'chip-g' : status === 'pending' ? 'chip-a' : 'chip-r';
  return '<span class="chip ' + cls + '">' + label + '</span>';
}

function statCard(label, value, icon, tone) {
  return '<div class="glass-card oc-stat"><div class="oc-stat-ic ' + (tone || '') + '"><i class="bi ' + icon + '"></i></div>'
    + '<div><p class="oc-kpi-label">' + esc(label) + '</p><p class="oc-kpi-val">' + esc(String(value || 0)) + '</p></div></div>';
}

function encSourceLabel(o) {
  const source = o && o.encSource;
  if (source === 'env') return 'Worker secret OPENCODE_ENC_KEY';
  if (source === 'db') return 'Custom key (opencode_enc_key row)';
  return 'Auto-seeded default passphrase';
}

function navItem(href, label, icon, route, active) {
  return '<a href="' + href + '" class="oc-link' + (active === route ? ' active' : '') + '"><i class="bi ' + icon + '"></i><span>' + esc(label) + '</span></a>';
}

function pageHead(icon, title, sub) {
  return '<div class="glass-card oc-panel" style="margin-bottom:12px;"><div class="oc-panel-head" style="margin-bottom:0;">'
    + '<div class="oc-stat-ic" style="width:38px;height:38px;"><i class="bi ' + icon + '"></i></div>'
    + '<div><h3 style="font-size:16px;">' + esc(title) + '</h3><p>' + esc(sub) + '</p></div></div></div>';
}

export function opencodeLoginPage(o = {}) {
  const configured = !!o.configured;
  const form = configured
    ? '<form method="POST" action="/opencode/login" class="space-y-4">'
      + '<div><label class="oc-label" for="ocPw">Admin password</label>'
      + '<div class="oc-pw"><input id="ocPw" type="password" name="password" required autofocus autocomplete="current-password" class="oc-input" placeholder="Enter control-plane password">'
      + '<button type="button" class="oc-pw-btn" onclick="ocTogglePw()" aria-label="Show password"><i class="bi bi-eye"></i></button></div>'
      + '<p class="oc-hint">Checked against a Cloudflare Worker secret. The password is never stored in D1.</p></div>'
      + '<button class="oc-btn oc-btn-block" style="padding:12px;">Unlock control plane <i class="bi bi-arrow-right"></i></button>'
      + '</form>'
    : '<div class="oc-setup">'
      + '<p class="oc-setup-title"><i class="bi bi-key-fill"></i> Admin password not configured</p>'
      + '<p>Set a Worker secret, then reload this page.</p>'
      + '<code>wrangler secret put OPENCODE_ADMIN_PASSWORD</code>'
      + '<p class="oc-hint">Owner shortcut: <a class="oc-link-inline" href="/login">login to the main panel</a>, then open <a class="oc-link-inline" href="/opencode">/opencode</a>. Panel user id 1 gets direct access.</p>'
      + '</div>';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<title>OpenCode Control - Admin Login</title>' + assetHead()
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
    + '<style>' + CSS + OCSS + '</style>' + assetTail() + MODE_EARLY + MODE_STANDALONE + '</head>'
    + '<body class="oc-login-body">'
    + '<div class="fixed top-4 right-4 z-50">' + MODE_BTN + '</div>'
    + '<main class="oc-login-wrap">'
    + '<section class="oc-login-brand"><div style="position:relative;z-index:1;">'
    + '<div class="flex items-center gap-3"><div class="oc-logo"><i class="bi bi-terminal-fill"></i></div>'
    + '<div><p class="oc-brand-name">OpenCode</p><p class="oc-brand-sub">CONTROL PLANE</p></div></div>'
    + '<h1>Ship the app.<br><span>Control the access.</span></h1>'
    + '<p>Standalone admin surface for the OpenCode Android client. Gmail accounts, device lock, global kill switch and encrypted app transport.</p>'
    + '<div class="oc-login-feats">'
    + '<div class="oc-login-feat"><i class="bi bi-shield-lock-fill"></i> AES-256-GCM app API envelopes</div>'
    + '<div class="oc-login-feat"><i class="bi bi-phone-fill"></i> One device per Gmail account</div>'
    + '<div class="oc-login-feat"><i class="bi bi-power"></i> Remote ON/OFF for every install</div>'
    + '<div class="oc-login-feat"><i class="bi bi-megaphone-fill"></i> In-app notices and version gate</div>'
    + '</div></div></section>'
    + '<section class="oc-login-card"><div class="oc-login-badge"><i class="bi bi-lock-fill"></i> Admin access</div>'
    + '<h2>OpenCode Control</h2><p class="sub">Sign in to manage app accounts, activation and remote settings.</p>'
    + '<div style="margin-top:18px;">' + flash({ ok: o.msg, error: o.error }) + form + '</div>'
    + '<div class="oc-login-foot"><span>Separate from the SDK panel</span><a href="/login">Main panel <i class="bi bi-arrow-up-right"></i></a></div>'
    + '</section></main><script>' + OC_JS + '</script></body></html>';
}

export function opencodeAdminLayout(o) {
  const route = o.route || 'overview';
  const actor = o.actor === 'owner' ? 'SDK owner' : 'Admin session';
  const encOk = !!o.encOk;
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<title>' + esc(o.title) + ' - OpenCode Control</title>' + assetHead()
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
    + '<style>' + CSS + OCSS + '</style>' + assetTail() + MODE_EARLY + MODE_STANDALONE + '</head>'
    + '<body class="oc-body">'
    + '<aside id="ocSide" class="oc-side">'
    + '<div class="oc-brand"><div class="oc-logo"><i class="bi bi-terminal-fill"></i></div><div><p class="oc-brand-name">OpenCode</p><p class="oc-brand-sub">CONTROL PLANE</p></div></div>'
    + '<nav class="oc-nav">'
    + '<p class="oc-sec">Workspace</p>'
    + navItem('/opencode', 'Overview', 'bi-grid-1x2-fill', route, 'overview')
    + navItem('/opencode/users', 'App accounts', 'bi-people-fill', route, 'users')
    + navItem('/opencode/notices', 'Notices', 'bi-megaphone-fill', route, 'notices')
    + navItem('/opencode/settings', 'Settings', 'bi-sliders', route, 'settings')
    + '<p class="oc-sec">Android app</p>'
    + '<div class="oc-apirow"><span>Transport</span><code>AES-256-GCM</code></div>'
    + '<div class="oc-apirow"><span>Endpoint</span><code>/api/opencode</code></div>'
    + '<div class="oc-apirow"><span>Accounts</span><code>@gmail.com</code></div>'
    + '</nav>'
    + '<div class="oc-side-foot">'
    + '<div class="oc-enc"><span class="oc-dot' + (encOk ? ' on' : '') + '"></span><div><p>Encryption ' + (encOk ? 'configured' : 'missing') + '</p><span>' + esc(encSourceLabel(o)) + '</span></div></div>'
    + '<a href="/dashboard" class="oc-backpanel" title="Return to the main panel"><i class="bi bi-grid-1x2-fill"></i> Main panel<i class="bi bi-arrow-up-right oc-backpanel-arrow"></i></a>'
    + '<a href="/opencode/logout" class="oc-signout"><i class="bi bi-box-arrow-right"></i> Sign out</a>'
    + '</div></aside>'
    + '<div id="ocOverlay" class="oc-overlay" onclick="ocSidebar()"></div>'
    + '<div class="oc-main">'
    + '<header class="oc-top">'
    + '<button class="oc-menu" onclick="ocSidebar()" aria-label="Open menu"><i class="bi bi-list text-lg"></i></button>'
    + '<div class="min-w-0"><p class="oc-crumb">OpenCode <span>/</span> Standalone control</p><h1 class="oc-title">' + esc(o.title) + '</h1></div>'
    + '<div class="oc-top-actions"><span class="oc-live">Live</span>' + MODE_BTN
    + '<a href="/dashboard" class="oc-top-back" title="Back to main panel"><i class="bi bi-grid-1x2-fill"></i><span class="hidden sm:inline">Main panel</span></a>'
    + '<span class="oc-actor"><i class="bi bi-person-check-fill"></i> ' + esc(actor) + '</span>'
    + '<a href="/opencode/logout" class="oc-top-logout"><i class="bi bi-box-arrow-right"></i><span class="hidden sm:inline">Sign out</span></a></div>'
    + '</header>'
    + '<main class="oc-content">' + flash(o) + (o.content || '') + '</main>'
    + '</div><script>' + OC_JS + '</script></body></html>';
}

export function opencodeOverview(data, o) {
  const s = data.settings || {};
  const stats = data.stats || {};
  const users = (data.users || []).slice(0, 6);
  const notices = (data.notices || []).slice(0, 3);
  const globalOn = String(s.global_enabled || '1') === '1';

  const hero = '<section class="oc-hero ' + (globalOn ? 'is-on' : 'is-off') + '">'
    + '<div class="oc-hero-main"><span class="oc-eyebrow">' + (globalOn ? 'Service online' : 'Service paused') + '</span>'
    + '<h2>' + (globalOn ? 'OpenCode access is live' : 'OpenCode access is paused') + '</h2>'
    + '<p>' + (globalOn
      ? 'Registered accounts can sign in. Per-user activation and expiry still apply. Turn this off to lock every install instantly.'
      : esc(s.maintenance_message || 'All OpenCode clients are paused by the administrator.'))
    + '</p></div>'
    + '<form method="POST" action="/opencode" class="oc-hero-actions"><input type="hidden" name="action" value="toggle_global">'
    + '<span class="oc-switch-state">' + (globalOn ? 'ON' : 'OFF') + '</span>'
    + '<button class="oc-hero-btn ' + (globalOn ? 'off' : 'on') + '"' + (globalOn ? ' onclick="return ocConfirm(\'Turn OFF OpenCode for every user?\')"' : '') + '>'
    + '<i class="bi ' + (globalOn ? 'bi-pause-fill' : 'bi-play-fill') + '"></i> ' + (globalOn ? 'Turn OFF all access' : 'Turn ON access') + '</button></form></section>';

  const userRows = users.map((u) => {
    const st = u.computed_status || u.status || 'pending';
    return '<tr><td><div class="min-w-0"><p class="font-bold text-[12px] truncate">' + esc(u.email) + '</p>'
      + '<p class="text-[9px] font-bold truncate" style="color:var(--muted)">#' + u.id + ' · ' + esc(u.display_name || 'No name') + '</p></div></td>'
      + '<td>' + statusChip(st) + '</td><td class="text-[10px] font-bold">' + fmtTime(u.expires_at) + '</td>'
      + '<td class="text-[9px] font-mono break-all max-w-[150px]">' + esc(u.device_name || u.device_id || '—') + '</td></tr>';
  }).join('');

  const noticeRows = notices.map((n) => '<div class="oc-notice"><div class="oc-notice-head">'
    + '<span class="chip ' + (n.is_active ? 'chip-g' : 'chip-r') + '">' + (n.is_active ? 'Active' : 'Off') + '</span>'
    + '<span class="oc-notice-meta" style="margin-top:0;">#' + n.id + ' · ' + fmtTime(n.created_at) + '</span></div>'
    + '<h4>' + esc(n.title) + '</h4><p>' + esc(n.message) + '</p></div>').join('');

  return hero
    + '<div class="oc-stats">'
    + statCard('Registered', stats.total, 'bi-people-fill', 'blue')
    + statCard('Active', stats.active, 'bi-check-circle-fill', 'green')
    + statCard('Pending', stats.pending, 'bi-hourglass-split', 'amber')
    + statCard('Disabled', stats.disabled, 'bi-slash-circle-fill', 'red')
    + statCard('Seen 24h', stats.online, 'bi-broadcast-pin', 'blue')
    + '</div>'
    + '<div class="oc-grid2">'
    + '<form method="POST" action="/opencode" class="glass-card oc-panel">'
    + '<div class="oc-panel-head"><div><h3><i class="bi bi-sliders2 mr-1"></i> Remote settings</h3>'
    + '<p>Global switch plus the fallback state shown inside the Android app.</p></div></div>'
    + '<label class="oc-toggle"><div><p>OpenCode enabled</p><small>Global kill switch for every account</small></div>'
    + '<input type="checkbox" name="global_enabled" value="1"' + (globalOn ? ' checked' : '') + '><span class="oc-track"></span></label>'
    + '<label class="oc-label" for="ocMaint">Maintenance / disabled message</label>'
    + '<textarea id="ocMaint" name="maintenance_message" maxlength="500" class="oc-ta mb-2" placeholder="App is temporarily paused by the admin.">' + esc(s.maintenance_message || '') + '</textarea>'
    + '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">'
    + '<div><label class="oc-label" for="ocSupport">Support URL</label><input id="ocSupport" name="support_url" value="' + esc(s.support_url || '') + '" class="oc-input" placeholder="https://t.me/..."></div>'
    + '<div><label class="oc-label" for="ocMin">Min app version code</label><input id="ocMin" type="number" min="1" name="min_version_code" value="' + esc(s.min_version_code || '1') + '" class="oc-input"></div></div>'
    + '<button name="action" value="save_settings" class="oc-btn oc-btn-block"><i class="bi bi-floppy-fill"></i> Save remote settings</button></form>'
    + '<form method="POST" action="/opencode/notices" class="glass-card oc-panel">'
    + '<div class="oc-panel-head"><div><h3><i class="bi bi-megaphone-fill mr-1"></i> Push notice</h3>'
    + '<p>Latest active notice appears in the app lock screen and chat banner.</p></div></div>'
    + '<label class="oc-label" for="ocNoticeTitle">Title</label><input id="ocNoticeTitle" name="title" maxlength="120" placeholder="Notice title" class="oc-input mb-2">'
    + '<label class="oc-label" for="ocNoticeMsg">Message</label><textarea id="ocNoticeMsg" name="message" maxlength="1200" class="oc-ta mb-2" placeholder="Activation update, maintenance, new version..."></textarea>'
    + '<button name="action" value="add_notice" class="oc-btn oc-btn-block"><i class="bi bi-send-fill"></i> Publish notice</button></form></div>'
    + '<div class="oc-grid2">'
    + '<div class="glass-card oc-panel"><div class="oc-panel-head"><div><h3><i class="bi bi-people-fill mr-1"></i> Recent accounts</h3>'
    + '<p>Latest Gmail registrations from the Android app.</p></div><a href="/opencode/users" class="mini-btn">View all <i class="bi bi-arrow-right"></i></a></div>'
    + '<div class="tbl-wrap" style="border:0;box-shadow:none;"><table class="tbl" style="min-width:520px;"><thead><tr><th>Account</th><th>Status</th><th>Expiry</th><th>Device</th></tr></thead><tbody>'
    + (userRows || '<tr><td colspan="4" class="oc-empty"><i class="bi bi-person-plus"></i>No app accounts yet</td></tr>')
    + '</tbody></table></div></div>'
    + '<div class="glass-card oc-panel"><div class="oc-panel-head"><div><h3><i class="bi bi-bell-fill mr-1"></i> Latest notices</h3>'
    + '<p>Active and paused notices, newest first.</p></div><a href="/opencode/notices" class="mini-btn">Manage <i class="bi bi-arrow-right"></i></a></div>'
    + (noticeRows || '<div class="oc-empty"><i class="bi bi-megaphone"></i>No notices published yet</div>')
    + '</div></div>'
    + '<div class="glass-card oc-panel" style="margin-bottom:16px;"><div class="oc-panel-head"><div><h3><i class="bi bi-shield-check mr-1"></i> App security posture</h3>'
    + '<p>These controls are enforced server-side; the app cannot bypass them.</p></div></div>'
    + '<div class="grid grid-cols-1 md:grid-cols-3 gap-2">'
    + '<div class="oc-status-card"><i class="bi bi-key-fill"></i><div><p>AES-256-GCM</p><small>' + esc(encSourceLabel(o)) + '</small></div></div>'
    + '<div class="oc-status-card"><i class="bi bi-google"></i><div><p>Gmail-only signup</p><small>@gmail.com enforced by the API</small></div></div>'
    + '<div class="oc-status-card"><i class="bi bi-phone-fill"></i><div><p>Device lock</p><small>One device per account, admin reset</small></div></div>'
    + '</div></div>';
}

export function opencodeUsersPage(data, o) {
  const users = data.users || [];
  const stats = data.stats || {};
  const q = o.q || '';
  const rows = users.map((u) => {
    const st = u.computed_status || u.status || 'pending';
    const qh = '<input type="hidden" name="q" value="' + esc(q) + '">';
    return '<tr>'
      + '<td><div class="min-w-0"><p class="font-bold text-[12.5px] truncate">' + esc(u.email) + '</p>'
      + '<p class="text-[9px] font-bold truncate" style="color:var(--muted)">#' + u.id + ' · ' + esc(u.display_name || 'No name') + '</p></div></td>'
      + '<td>' + statusChip(st) + '</td>'
      + '<td class="text-[10px] font-bold">' + fmtTime(u.expires_at) + '</td>'
      + '<td class="text-[9px] font-mono break-all max-w-[160px]">' + esc(u.device_name || u.device_id || '—') + '</td>'
      + '<td class="text-[9px] font-bold" style="color:var(--muted)">' + fmtTime(u.last_seen) + '</td>'
      + '<td><form method="POST" action="/opencode/users" class="oc-actions">' + qh
      + '<input type="hidden" name="user_id" value="' + u.id + '">'
      + '<input type="number" name="days" value="30" min="1" max="3650" aria-label="Days">'
      + '<button name="action" value="activate_user" class="mini-btn" title="Activate for N days"><i class="bi bi-check2-circle"></i></button>'
      + '<button name="action" value="extend_user" class="mini-btn" title="Extend from current expiry"><i class="bi bi-plus-lg"></i></button>'
      + '<button name="action" value="reset_device" onclick="return ocConfirm(\'Reset device binding for this user?\')" class="mini-btn" title="Reset device"><i class="bi bi-phone"></i></button>'
      + '<button name="action" value="revoke_sessions" onclick="return ocConfirm(\'Revoke all app sessions?\')" class="mini-btn" title="Revoke sessions"><i class="bi bi-box-arrow-right"></i></button>'
      + '<button name="action" value="pending_user" class="mini-btn" title="Move back to pending"><i class="bi bi-hourglass-split"></i></button>'
      + '<button name="action" value="disable_user" onclick="return ocConfirm(\'Disable this user?\')" class="mini-btn danger" title="Disable"><i class="bi bi-slash-circle"></i></button>'
      + '<button name="action" value="delete_user" onclick="return ocConfirm(\'Delete this user permanently?\')" class="mini-btn danger" title="Delete"><i class="bi bi-trash"></i></button>'
      + '</form></td></tr>';
  }).join('');

  return pageHead('bi-people-fill', 'App accounts', 'Gmail + password registrations from the OpenCode Android app. Device lock, activation and expiry are enforced per account.')
    + '<div class="oc-toolbar"><div class="oc-summary">'
    + '<span class="oc-chip">Total <b>' + esc(String(stats.total || 0)) + '</b></span>'
    + '<span class="oc-chip">Active <b>' + esc(String(stats.active || 0)) + '</b></span>'
    + '<span class="oc-chip">Pending <b>' + esc(String(stats.pending || 0)) + '</b></span>'
    + '<span class="oc-chip">Disabled <b>' + esc(String(stats.disabled || 0)) + '</b></span>'
    + '<span class="oc-chip">Online 24h <b>' + esc(String(stats.online || 0)) + '</b></span></div>'
    + '<form method="GET" action="/opencode/users" class="oc-search"><i class="bi bi-search"></i>'
    + '<input name="q" value="' + esc(q) + '" placeholder="Search Gmail address..."><button type="submit" aria-label="Search"><i class="bi bi-arrow-return-left"></i></button></form></div>'
    + '<div class="glass-card" style="padding:0;overflow:hidden;"><div class="tbl-wrap" style="border:0;box-shadow:none;">'
    + '<table class="tbl"><thead><tr><th>Account</th><th>Status</th><th>Expiry</th><th>Device</th><th>Last seen</th><th>Actions</th></tr></thead><tbody>'
    + (rows || '<tr><td colspan="6" class="oc-empty"><i class="bi bi-person-plus"></i>No app accounts match this search</td></tr>')
    + '</tbody></table></div></div>'
    + '<p class="oc-hint" style="margin-top:10px;">Actions apply immediately. "Activate" starts a fresh N-day window; "Extend" adds N days from the current expiry. The days box is per row.</p>';
}

export function opencodeNoticesPage(data, o) {
  const notices = data.notices || [];
  const rows = notices.map((n) => '<div class="oc-notice">'
    + '<div class="oc-notice-head"><span class="chip ' + (n.is_active ? 'chip-g' : 'chip-r') + '">' + (n.is_active ? 'Active' : 'Off') + '</span>'
    + '<span class="oc-notice-meta" style="margin-top:0;">#' + n.id + ' · ' + fmtTime(n.created_at) + '</span>'
    + '<form method="POST" action="/opencode/notices" class="oc-notice-actions"><input type="hidden" name="notice_id" value="' + n.id + '">'
    + '<button name="action" value="toggle_notice" class="mini-btn" title="Toggle"><i class="bi bi-power"></i></button>'
    + '<button name="action" value="delete_notice" onclick="return ocConfirm(\'Delete this notice?\')" class="mini-btn danger" title="Delete"><i class="bi bi-trash"></i></button></form></div>'
    + '<h4>' + esc(n.title) + '</h4><p>' + esc(n.message) + '</p></div>').join('');

  return pageHead('bi-megaphone-fill', 'Notices', 'Publish a message to every OpenCode install. The latest active notice is shown in the app; older ones stay archived here.')
    + '<div class="oc-grid2">'
    + '<form method="POST" action="/opencode/notices" class="glass-card oc-panel">'
    + '<div class="oc-panel-head"><div><h3><i class="bi bi-send-fill mr-1"></i> Publish notice</h3><p>Use this for maintenance, activation updates or new builds.</p></div></div>'
    + '<label class="oc-label" for="ocTitle">Title</label><input id="ocTitle" name="title" maxlength="120" required placeholder="Notice title" class="oc-input mb-2">'
    + '<label class="oc-label" for="ocMessage">Message</label><textarea id="ocMessage" name="message" maxlength="1200" required class="oc-ta mb-2" placeholder="What should every app user see?"></textarea>'
    + '<button name="action" value="add_notice" class="oc-btn oc-btn-block"><i class="bi bi-megaphone-fill"></i> Publish to app</button></form>'
    + '<div class="glass-card oc-panel"><div class="oc-panel-head"><div><h3><i class="bi bi-clock-history mr-1"></i> Delivery behaviour</h3><p>How the Android client consumes notices.</p></div></div>'
    + '<div class="oc-status-card"><i class="bi bi-arrow-repeat"></i><div><p>Latest active wins</p><small>Each encrypted /status response includes only the newest active notice.</small></div></div>'
    + '<div class="oc-status-card"><i class="bi bi-toggle-on"></i><div><p>Pause without deleting</p><small>Toggle a notice off to hide it while keeping the history.</small></div></div>'
    + '<div class="oc-status-card"><i class="bi bi-shield-lock"></i><div><p>Encrypted in transit</p><small>Notice text is delivered inside the AES-256-GCM envelope.</small></div></div></div></div>'
    + '<div class="glass-card oc-panel"><div class="oc-panel-head"><div><h3><i class="bi bi-collection-fill mr-1"></i> Notice history</h3><p>' + esc(String(notices.length)) + ' notice(s) stored.</p></div></div>'
    + (rows || '<div class="oc-empty"><i class="bi bi-megaphone"></i>No notices yet. Publish the first one above.</div>')
    + '</div>';
}

export function opencodeSettingsPage(data, o) {
  const s = data.settings || {};
  const encOk = !!o.encOk;
  const source = o.adminSource || '';
  return pageHead('bi-sliders', 'Settings', 'Remote state, version gate and the standalone admin surface. App-facing changes take effect on the next encrypted status call.')
    + '<div class="oc-grid2">'
    + '<form method="POST" action="/opencode/settings" class="glass-card oc-panel">'
    + '<div class="oc-panel-head"><div><h3><i class="bi bi-gear-fill mr-1"></i> Remote configuration</h3><p>Stored in opencode_settings and returned to every app.</p></div></div>'
    + '<label class="oc-toggle"><div><p>OpenCode enabled</p><small>Global kill switch</small></div>'
    + '<input type="checkbox" name="global_enabled" value="1"' + (String(s.global_enabled || '1') === '1' ? ' checked' : '') + '><span class="oc-track"></span></label>'
    + '<label class="oc-label" for="ocMaintenance">Maintenance / disabled message</label>'
    + '<textarea id="ocMaintenance" name="maintenance_message" maxlength="500" class="oc-ta mb-2" placeholder="Shown when the global switch is OFF.">' + esc(s.maintenance_message || '') + '</textarea>'
    + '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">'
    + '<div><label class="oc-label" for="ocSupportUrl">Support URL</label><input id="ocSupportUrl" name="support_url" value="' + esc(s.support_url || '') + '" class="oc-input" placeholder="https://t.me/..."></div>'
    + '<div><label class="oc-label" for="ocMinVer">Min app version code</label><input id="ocMinVer" type="number" min="1" name="min_version_code" value="' + esc(s.min_version_code || '1') + '" class="oc-input"></div></div>'
    + '<button name="action" value="save_settings" class="oc-btn oc-btn-block"><i class="bi bi-floppy-fill"></i> Save settings</button></form>'
    + '<div class="glass-card oc-panel"><div class="oc-panel-head"><div><h3><i class="bi bi-shield-lock-fill mr-1"></i> Security status</h3><p>The app key works out of the box (auto-seed); a custom key or a Worker secret overrides it.</p></div></div>'
    + '<div class="oc-status-card"><i class="bi bi-key-fill"></i><div><p>App encryption key</p><small class="' + (encOk ? 'ok' : 'warn') + '">' + esc(encSourceLabel(o)) + ' (AES-256-GCM)</small></div></div>'
    + '<div class="oc-status-card"><i class="bi bi-person-lock"></i><div><p>Standalone admin password</p><small class="' + (source ? 'ok' : 'warn') + '">' + (source ? 'Configured via ' + esc(source) : 'Not configured — set OPENCODE_ADMIN_PASSWORD') + '</small></div></div>'
    + '<div class="oc-status-card"><i class="bi bi-cookie"></i><div><p>Admin session</p><small>HttpOnly cookie <b>oc_admin</b>, 7-day expiry, SameSite=Lax. Owner id 1 can also enter from the SDK panel.</small></div></div>'
    + '<div class="oc-status-card"><i class="bi bi-database-fill"></i><div><p>Custom key (no Cloudflare step)</p><small>Run this once against the <b>panel</b> D1 database. 64 hex chars = raw key, anything else = SHA-256 passphrase. The APK must be rebuilt with the same value.</small><div class="oc-code" style="margin-top:8px;">INSERT OR REPLACE INTO opencode_settings (key,value)<br>VALUES (\'opencode_enc_key\',\'<i>&lt;64-hex or passphrase&gt;</i>\');</div></div></div></div></div>'
    + '<div class="glass-card oc-panel" style="margin-top:16px;"><div class="oc-panel-head"><div><h3><i class="bi bi-phone-fill mr-1"></i> Android app API</h3><p>Separate from the SDK/tenant routes; all bodies are encrypted envelopes.</p></div></div>'
    + '<div class="grid grid-cols-1 md:grid-cols-2 gap-2">'
    + '<div class="oc-status-card"><i class="bi bi-box-arrow-in-right"></i><div><p>POST /api/opencode/register</p><small>@gmail.com + password (8-128 chars) + device id. Creates a pending account.</small></div></div>'
    + '<div class="oc-status-card"><i class="bi bi-box-arrow-in-right"></i><div><p>POST /api/opencode/login</p><small>Email + password. Enforces the one-device binding.</small></div></div>'
    + '<div class="oc-status-card"><i class="bi bi-arrow-repeat"></i><div><p>POST /api/opencode/status</p><small>Session token + device id. Returns active state, expiry, notice and version gate.</small></div></div>'
    + '<div class="oc-status-card"><i class="bi bi-box-arrow-right"></i><div><p>POST /api/opencode/logout</p><small>Revokes the opaque app session token.</small></div></div></div></div>';
}
