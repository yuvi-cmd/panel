import { CSS, MODE_BTN, MODE_EARLY, MODE_STANDALONE, esc } from './ui.js';

function side(panelName) {
  return '<aside class="auth-side"><div style="position:relative;z-index:1;max-width:400px;">'
    + '<div class="flex items-center gap-3"><div class="w-11 h-11 rounded-xl flex items-center justify-center text-xl text-white" style="background:var(--acc);box-shadow:0 4px 16px var(--acc-glow);"><i class="bi bi-shield-check"></i></div>'
    + '<p class="text-lg font-extrabold tracking-tight">' + esc(panelName) + '</p></div>'
    + '<h2 class="text-3xl font-extrabold tracking-tight mt-8" style="line-height:1.15;">Key management,<br>minus the mess.</h2>'
    + '<p class="mt-3 text-sm" style="color:#B9BCE0;">Issue, bind and monitor keys per tenant — from any device.</p>'
    + '<div class="auth-feat"><i class="bi bi-check-circle-fill"></i><span>Keys bound to devices with per-key limits</span></div>'
    + '<div class="auth-feat"><i class="bi bi-check-circle-fill"></i><span>Tenant-isolated panels and role hierarchy</span></div>'
    + '<div class="auth-feat"><i class="bi bi-check-circle-fill"></i><span>Live connect &amp; encrypt APIs</span></div>'
    + '<p class="auth-footnote mt-10 text-xs" style="color:#7E82A8;">Protected by device lock · 24h reset cooldown</p>'
    + '</div></aside>';
}

function shell(panelName, heading, sub, inner) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">'
    + '<title>' + esc(heading) + ' - ' + esc(panelName) + '</title><script src="https://cdn.tailwindcss.com"></script>'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
    + '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">'
    + '<style>' + CSS + '.clay-input{width:100%;background:var(--input);border:1px solid var(--line);border-radius:10px;padding:13px 15px;font-size:15px;font-weight:500;outline:none;color:var(--ink);}.clay-input:focus{border-color:var(--acc);box-shadow:0 0 0 3px var(--acc-soft);}.label-dark{display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;}.alert-box{padding:12px 14px;border-radius:10px;font-size:13px;font-weight:600;margin-bottom:16px;}.alert-error{background:var(--danger-bg);border:1px solid var(--danger-line);color:var(--danger-tx);}.alert-success{background:var(--ok-bg);border:1px solid var(--ok-line);color:var(--ok-tx);}</style>' + MODE_EARLY + MODE_STANDALONE + '</head>'
    + '<body><div class="auth-grid">'
    + side(panelName)
    + '<main class="auth-main"><div class="fixed top-4 right-4 z-50">' + MODE_BTN + '</div>'
    + '<div class="auth-box"><div class="glass-card auth-card p-6 md:p-8"><div class="mb-5"><h1 class="text-xl font-extrabold tracking-tight" style="color:var(--ink)">' + esc(heading) + '</h1><p class="text-[13px] mt-1" style="color:var(--muted)">' + esc(sub) + '</p></div>' + inner + '</div></div></main>'
    + '</div></body></html>';
}

function alerts(error, msg, errorLink) {
  // FIX (XSS): error text is always escaped. The only allowed HTML is an
  // internal static link (e.g. Reset Device) passed via errorLink.
  const link = errorLink === 'reset'
    ? ' <a href="/reset-device" class="underline font-bold">Reset Device</a>'
    : '';
  return (error ? '<div class="alert-box alert-error"><i class="bi bi-exclamation-circle-fill"></i> ' + esc(error) + link + '</div>' : '')
    + (msg ? '<div class="alert-box alert-success"><i class="bi bi-check-circle-fill"></i> ' + esc(msg) + '</div>' : '');
}

const FP_JS = `<script>
function collectFP(){try{var c=document.createElement('canvas');c.width=200;c.height=50;var x=c.getContext('2d');x.textBaseline='top';x.font='14px Arial';x.fillStyle='#f60';x.fillRect(125,1,62,20);x.fillStyle='#069';x.fillText('Fingerprint',2,15);var cf=c.toDataURL();var w='unknown';try{var g=document.createElement('canvas').getContext('webgl');var e=g.getExtension('WEBGL_debug_renderer_info');w=e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown';}catch(e){}var a='unknown';try{var ac=new (window.AudioContext||window.webkitAudioContext)();a=ac.sampleRate.toString();ac.close();}catch(e){}return JSON.stringify({screen:screen.width+'x'+screen.height,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,platform:navigator.platform,canvas:String(cf).substring(0,80),webgl:String(w).substring(0,80),audio:a});}catch(e){return '{}';}}
document.addEventListener('DOMContentLoaded',function(){var el=document.getElementById('device_info_login');if(el)el.value=collectFP();});
</script>`;

export function loginPage(o) {
  const inner = alerts(o.error || '', o.msg || '', o.errorLink || '')
    + '<form method="POST" class="space-y-3.5"><input type="hidden" name="device_info" id="device_info_login">'
    + '<div><label class="label-dark">Username</label><input type="text" name="username" required class="clay-input" placeholder="Enter your username"></div>'
    + '<div><label class="label-dark">Password</label><input type="password" name="password" required class="clay-input" placeholder="Enter your password"></div>'
    + '<button class="btn-premium w-full py-4 rounded-2xl font-extrabold text-sm uppercase">Login <i class="bi bi-arrow-right"></i></button></form>'
    + '<div class="my-4 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>'
    + '<div class="text-center mb-3"><p class="text-xs text-slate-600 font-medium">New here? <a href="/register" class="text-blue-700 font-bold">Create Account</a> <span class="text-slate-300 mx-1">|</span> <a href="/join-panel" class="text-blue-700 font-bold">Join Panel</a></p></div>'
    + '<a href="/reset-device" class="block text-center w-full py-3.5 rounded-2xl font-bold text-[13px] text-blue-600 bg-blue-50 border border-blue-200"><i class="bi bi-phone"></i> Reset Device</a>'
    + FP_JS;
  return shell(o.panelName, 'Welcome Back', 'Sign in to continue', inner);
}

export function registerPage(o) {
  const inner = alerts(o.error || '', o.msg || '')
    + '<form method="POST" class="space-y-3.5">'
    + '<div><label class="label-dark">Full Name</label><input type="text" name="full_name" required class="clay-input" placeholder="Your name"></div>'
    + '<div><label class="label-dark">Username</label><input type="text" name="username" required class="clay-input" placeholder="Choose username"></div>'
    + '<div><label class="label-dark">Password</label><input type="password" name="password" required class="clay-input" placeholder="Min 4 characters"></div>'
    + '<div><label class="label-dark">Referral Code</label><input type="text" name="referral_code" required class="clay-input font-mono" placeholder="REF-XXXXXXXX"></div>'
    + '<button class="btn-premium w-full py-4 rounded-2xl font-extrabold text-sm uppercase">Create Account <i class="bi bi-arrow-right"></i></button></form>'
    + '<div class="text-center mt-4"><a href="/login" class="text-xs text-blue-700 font-bold">Back to Login</a></div>';
  return shell(o.panelName, 'Create Account', 'Referral code required', inner);
}

export function resetPage(o) {
  const inner = alerts(o.error || '', o.msg || '')
    + '<form method="POST" class="space-y-3.5">'
    + '<div><label class="label-dark">Username</label><input type="text" name="username" required class="clay-input"></div>'
    + '<div><label class="label-dark">Password</label><input type="password" name="password" required class="clay-input"></div>'
    + '<div class="text-[11px] text-slate-500 bg-slate-50 border rounded-xl p-3">Reset ke baad purani device logout ho jayegi. 24 ghante me 1 baar hi reset hota hai.</div>'
    + '<button class="btn-premium w-full py-4 rounded-2xl font-extrabold text-sm uppercase"><i class="bi bi-phone"></i> Reset Device</button></form>'
    + '<div class="text-center mt-4"><a href="/login" class="text-xs text-blue-700 font-bold">Back to Login</a></div>';
  return shell(o.panelName, 'Reset Device', 'Login on new device', inner);
}

export function joinPage(o) {
  const locked = !!o.defaultCode;
  const codeVal = esc(o.defaultCode || o.keepCode || '');
  const inner = alerts(o.error || '', o.msg || '')
    + '<form method="POST" class="space-y-3.5">'
    + '<div><label class="label-dark">Panel Code</label><input type="text" name="panel_code" required class="clay-input font-mono' + (locked ? ' opacity-70' : '') + '" placeholder="YUVI_001" value="' + codeVal + '"' + (locked ? ' readonly' : '') + '>'
    + (locked ? '<p class="text-[11px] font-semibold mt-1.5" style="color:var(--muted)"><i class="bi bi-lock-fill"></i> Default tenant se locked hai — code change nahi hoga.</p>' : '')
    + '</div>'
    + '<div><label class="label-dark">Username</label><input type="text" name="username" required class="clay-input"></div>'
    + '<div><label class="label-dark">Password</label><input type="password" name="password" required class="clay-input"></div>'
    + '<div class="text-[11px] text-slate-500 bg-slate-50 border rounded-xl p-3">Claim hone par <b>sirf 1 Owner account</b> banta hai. Panel khaali hona chahiye (koi OWNER nahi).</div>'
    + '<button class="btn-premium w-full py-4 rounded-2xl font-extrabold text-sm uppercase">Join as Owner</button></form>'
    + '<div class="text-center mt-4"><a href="/login" class="text-xs text-blue-700 font-bold">Back to Login</a></div>';
  return shell(o.panelName, 'Join Panel', locked ? 'Default tenant — code locked' : 'Claim empty panel as owner', inner);
}

// deviceFingerprint / sha256HexStr ab backend me hain: src/backend/device.js
// (login + /api device lock dono wahin se use karte hain).
