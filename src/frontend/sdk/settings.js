import { esc } from '../ui.js';

function pill(label, value, tone) {
  return '<div class="glass-card p-4"><p class="text-[10px] font-extrabold text-slate-400 uppercase">' + esc(label) + '</p><p class="text-base font-black ' + tone + '">' + esc(value) + '</p></div>';
}

function field(label, input, hint) {
  return '<div><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">' + label + '</label>'
    + input + (hint ? '<p class="text-[10px] text-slate-400 mt-1">' + hint + '</p>' : '') + '</div>';
}

function input(name, value, attrs = '') {
  return '<input name="' + name + '" value="' + esc(value || '') + '" ' + attrs + ' class="w-full clay-card px-4 py-3 text-sm rounded-2xl">';
}

export function settingsPage(o) {
  const s = o.settings || {};
  const signing = o.signing || {};
  const encryption = o.encryption || {};
  const admin = o.admin || {};
  const csrf = o.csrf || '';
  const enabled = !!Number(s.server_enabled);
  const guestProof = !!Number(s.guest_proof_required);

  const ok = o.ok ? '<div class="glass-card p-4 mb-4" style="border-left:4px solid #10b981"><p class="text-xs font-bold text-emerald-700"><i class="bi bi-check-circle-fill mr-1"></i> ' + esc(o.ok) + '</p></div>' : '';
  const err = o.err ? '<div class="glass-card p-4 mb-4" style="border-left:4px solid #ef4444"><p class="text-xs font-bold text-red-700"><i class="bi bi-exclamation-circle-fill mr-1"></i> ' + esc(o.err) + '</p></div>' : '';

  return ok + err
    + '<div class="pagehead"><div class="ph-ic"><i class="bi bi-sliders"></i></div><div class="flex-1 min-w-0"><h1 class="truncate">MAK Settings</h1><p class="truncate">Global switch, protocol timings and signing identity</p></div></div>'
    + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">'
    + pill('Activation server', enabled ? 'ONLINE' : 'OFFLINE', enabled ? 'text-emerald-600' : 'text-red-600')
    + pill('Signing', signing.ok ? 'Ed25519 ready' : 'Not generated', signing.ok ? 'text-emerald-600' : 'text-amber-600')
    + pill('Envelope', encryption.ok ? 'X25519 ready' : 'Not generated', encryption.ok ? 'text-emerald-600' : 'text-amber-600')
    + pill('Guest proof', guestProof ? 'Required' : 'Off', guestProof ? 'text-emerald-600' : 'text-slate-600')
    + '</div>'
    + '<div class="grid lg:grid-cols-[1.5fr_1fr] gap-4 items-start">'
    + '<div class="space-y-4">'
    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-3"><i class="bi bi-toggles text-purple-500"></i> Activation server</h3>'
    + '<form method="POST" action="/sdk/settings/server" class="space-y-3"><input type="hidden" name="_csrf" value="' + esc(csrf) + '"><input type="hidden" name="action" value="save">'
    + '<label class="clay-card p-4 rounded-2xl flex items-center gap-3 cursor-pointer"><input type="checkbox" name="server_enabled" value="1" ' + (enabled ? 'checked' : '') + ' class="w-6 h-6" style="accent-color:#10b981"><span class="text-sm font-black flex-1">Activation decisions enabled</span><span class="text-[10px] font-extrabold ' + (enabled ? 'text-emerald-600' : 'text-red-600') + '">' + (enabled ? 'ON' : 'OFF') + '</span></label>'
    + field('Maintenance message', input('maintenance_message', s.maintenance_message, 'maxlength="300"'))
    + field('Operator announcement', input('announcement', s.announcement, 'maxlength="500" placeholder="Optional dashboard note"'))
    + '<p class="text-[11px] text-slate-500">OFF immediately denies activate, host verification and every guest check. The panel stays available.</p>'
    + '<button class="btn-premium w-full py-3 rounded-xl text-xs font-bold uppercase">Save server status</button></form></div>'

    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-3"><i class="bi bi-clock-history text-blue-500"></i> Protocol timings</h3>'
    + '<form method="POST" action="/sdk/settings/protocol" class="space-y-3"><input type="hidden" name="_csrf" value="' + esc(csrf) + '">'
    + '<div class="grid sm:grid-cols-2 gap-3">'
    + field('Session TTL (seconds)', input('session_ttl', s.session_ttl, 'type="number" min="60" max="86400" required'), 'Default authorization session lifetime.')
    + field('Heartbeat (seconds)', input('heartbeat_interval', s.heartbeat_interval, 'type="number" min="30" max="3600" required'), 'Client heartbeat cadence.')
    + field('Challenge TTL (seconds)', input('challenge_ttl', s.challenge_ttl, 'type="number" min="15" max="300" required'), 'Single-use nonce lifetime.')
    + field('Clock skew (seconds)', input('clock_skew', s.clock_skew, 'type="number" min="30" max="900" required'), 'Accepted request timestamp drift.')
    + field('Guest auth TTL (seconds)', input('authorization_ttl', s.authorization_ttl, 'type="number" min="30" max="600" required'), 'Validity of each signed guest decision.')
    + field('Server version label', input('server_version', s.server_version, 'maxlength="32" required'), 'Shown in status responses.')
    + '</div>'
    + '<label class="clay-card p-3 rounded-2xl flex items-center gap-3 cursor-pointer mt-3"><input type="checkbox" name="guest_proof_required" value="1" ' + (guestProof ? 'checked' : '') + ' class="w-5 h-5" style="accent-color:#8b5cf6"><span class="text-xs font-bold flex-1">Require device proof on guest checks</span></label>'
    + '<button class="btn-premium w-full py-3 rounded-xl text-xs font-bold uppercase">Save protocol settings</button></form></div>'

    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-3"><i class="bi bi-shield-lock-fill text-emerald-500"></i> Signing identity</h3>'
    + '<div class="space-y-2 text-xs text-slate-600">'
    + '<p><b>Signing key:</b> ' + esc(signing.keyId || 'not generated') + '</p>'
    + '<p><b>Ed25519 fingerprint:</b> <code class="break-all">' + esc(signing.fingerprint || '—') + '</code></p>'
    + '<p><b>Envelope key:</b> ' + esc(encryption.keyId || 'not generated') + '</p>'
    + '<p><b>X25519 fingerprint:</b> <code class="break-all">' + esc(encryption.fingerprint || '—') + '</code></p>'
    + '<p><b>Algorithm:</b> Ed25519 signatures + NaCl box envelopes</p>'
    + '</div>'
    + (!signing.ok || !encryption.ok
      ? '<div class="mt-3 bg-amber-50 border border-amber-100 rounded-2xl p-3 text-[11px] text-amber-800">Keys are not generated yet. Open <b>Server</b> and press <b>Generate MAK/2 keys</b>.</div>'
      : '<div class="mt-3 bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-[11px] text-emerald-800">Rotate keys from <b>Server</b>. Installed clients follow the signed rotation chain automatically — no APK rebuild.</div>')
    + '<a href="/sdk/server" class="btn-premium inline-block mt-3 px-4 py-2.5 rounded-xl text-xs font-bold"><i class="bi bi-key-fill mr-1"></i> Open Server &amp; Keys</a></div>'

    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-3"><i class="bi bi-lock-fill text-slate-500"></i> Administrator password</h3>'
    + '<form method="POST" action="/sdk/settings/password" class="space-y-3"><input type="hidden" name="_csrf" value="' + esc(csrf) + '">'
    + field('Current password', '<input type="password" name="current_password" autocomplete="current-password" required class="w-full clay-card px-4 py-3 text-sm rounded-2xl">')
    + '<div class="grid sm:grid-cols-2 gap-3">'
    + field('New password', '<input type="password" name="new_password" minlength="10" maxlength="200" autocomplete="new-password" required class="w-full clay-card px-4 py-3 text-sm rounded-2xl">')
    + field('Confirm password', '<input type="password" name="confirm_password" minlength="10" maxlength="200" autocomplete="new-password" required class="w-full clay-card px-4 py-3 text-sm rounded-2xl">')
    + '</div>'
    + '<button class="btn-premium w-full py-3 rounded-xl text-xs font-bold uppercase">Update password</button></form></div>'
    + '</div>'

    + '<div class="space-y-4">'
    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-3"><i class="bi bi-activity text-purple-500"></i> Posture</h3>'
    + '<div class="space-y-2 text-xs text-slate-600">'
    + '<div class="flex justify-between gap-2"><span class="text-slate-400 font-bold">Server</span><b>' + (enabled ? 'ONLINE' : 'OFFLINE') + '</b></div>'
    + '<div class="flex justify-between gap-2"><span class="text-slate-400 font-bold">Signing</span><b>' + (signing.ok ? 'READY' : 'MISSING') + '</b></div>'
    + '<div class="flex justify-between gap-2"><span class="text-slate-400 font-bold">Envelope</span><b>' + (encryption.ok ? 'READY' : 'MISSING') + '</b></div>'
    + '<div class="flex justify-between gap-2"><span class="text-slate-400 font-bold">Guest proof</span><b>' + (guestProof ? 'REQUIRED' : 'OFF') + '</b></div>'
    + '<div class="flex justify-between gap-2"><span class="text-slate-400 font-bold">Admin</span><b>' + esc(admin.username || '—') + '</b></div>'
    + '<div class="flex justify-between gap-2"><span class="text-slate-400 font-bold">Protocol</span><b>MAK/2</b></div>'
    + '</div></div>'
    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-3"><i class="bi bi-info-circle text-blue-500"></i> Quick guide</h3>'
    + '<ul class="text-[11px] text-slate-600 space-y-2 list-disc pl-4">'
    + '<li><b>Generate MAK</b> me sirf package limit, app names aur duration bharna hai.</li>'
    + '<li><b>Install seats</b> = ek host package par kitne active installs allowed (default 3).</li>'
    + '<li><b>MAK Keys</b> me key blurred dikhegi — eye se show, copy button se copy.</li>'
    + '<li>Custom MAK me koi fixed length nahi — jo likhoge wahi chalega.</li>'
    + '</ul></div>'
    + '</div></div>';
}
