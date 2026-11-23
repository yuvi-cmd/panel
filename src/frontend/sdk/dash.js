import { esc } from '../ui.js';

function fmtDate(seconds) {
  if (!seconds) return 'No expiry';
  const d = new Date(Number(seconds) * 1000);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusChip(status) {
  const s = String(status || '').toUpperCase();
  const cls = s === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600'
    : s === 'SUSPENDED' ? 'bg-amber-50 text-amber-600'
      : 'bg-red-50 text-red-600';
  return '<span class="text-[10px] font-extrabold px-2 py-1 rounded-lg uppercase ' + cls + '">' + esc(s || 'UNKNOWN') + '</span>';
}

function statCard(label, value, sub, icon, tone) {
  return '<div class="glass-card p-4 md:p-5"><div class="flex items-center justify-between mb-3">'
    + '<div class="w-10 h-10 rounded-xl ' + tone + ' flex items-center justify-center text-white shadow-lg"><i class="bi ' + icon + '"></i></div>'
    + '<span class="text-[10px] font-extrabold px-2 py-1 rounded-lg uppercase ' + tone.replace('bg-', 'text-').replace('-500', '-500') + ' bg-slate-50">' + esc(label) + '</span></div>'
    + '<p class="text-2xl md:text-3xl font-black text-slate-800">' + esc(String(value)) + '</p>'
    + '<p class="text-[11px] text-slate-500 font-medium mt-1">' + esc(sub) + '</p></div>';
}

export function dashboardPage(d) {
  const stats = d.stats || {};
  const server = d.server || {};
  const recent = d.recent || [];

  const warnings = [];
  if (!server.enabled) {
    warnings.push('<div class="glass-card p-4 mb-4" style="border-left:4px solid #ef4444"><p class="font-bold text-red-700 text-sm"><i class="bi bi-exclamation-circle-fill mr-1"></i> Activation server is OFF</p><p class="text-xs text-slate-600 mt-1">Every authorize/guest/renew/heartbeat request is denied. Turn it on from <a class="underline font-bold" href="/sdk/server">Server</a>.</p></div>');
  }
  if (!server.signingReady) {
    warnings.push('<div class="glass-card p-4 mb-4" style="border-left:4px solid #f59e0b"><p class="font-bold text-amber-700 text-sm"><i class="bi bi-shield-exclamation mr-1"></i> Signing key missing</p><p class="text-xs text-slate-600 mt-1">MAK issuance works, but signed decisions fail closed until <code>MAK_SIGNING_KEY</code> is set as a Worker secret.</p></div>');
  }

  const recentHtml = recent.length ? recent.map((l) =>
    '<div class="clay-card p-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl">'
    + '<div class="min-w-0 flex-1"><p class="text-sm font-bold text-slate-800 truncate">' + esc(l.label || l.license_uid) + '</p>'
    + '<p class="text-[10px] font-mono text-slate-400 mt-0.5">' + esc(l.license_uid) + (l.host_package ? ' · ' + esc(l.host_package) : '') + '</p></div>'
    + '<div class="flex items-center gap-2">' + statusChip(l.status)
    + '<span class="text-[10px] text-slate-400">' + esc(fmtDate(l.expires_at)) + '</span>'
    + '<a href="/sdk/keys/' + Number(l.id) + '" class="clay-card px-3 py-1.5 text-xs font-bold text-slate-600 rounded-xl">Open</a></div></div>'
  ).join('') : '<div class="text-center py-8 text-slate-400"><i class="bi bi-inbox text-4xl mb-2 opacity-40"></i><p class="text-sm">No MAK issued yet</p><a href="/sdk/generate" class="inline-block mt-2 text-xs font-bold text-purple-600 hover:underline">Generate the first MAK →</a></div>';

  return warnings.join('')
    + '<div class="pagehead"><div class="ph-ic"><i class="bi bi-speedometer2"></i></div><div class="flex-1 min-w-0"><h1 class="truncate">MAK Dashboard</h1><p class="truncate">Activation licenses, devices and sessions</p></div></div>'
    + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">'
    + statCard('Total', stats.total || 0, 'MAK licenses issued', 'bi-key-fill', 'bg-purple-500')
    + statCard('Active', stats.active || 0, 'Ready for activation', 'bi-check-circle-fill', 'bg-emerald-500')
    + statCard('Devices', stats.devices || 0, (stats.devices_online || 0) + ' seen in last 10 min', 'bi-phone-fill', 'bg-blue-500')
    + statCard('Sessions', stats.sessions || 0, 'Signed sessions live', 'bi-broadcast-pin', 'bg-amber-500')
    + '</div>'
    + '<div class="grid lg:grid-cols-3 gap-4 mb-6">'
    + '<div class="glass-card p-5 lg:col-span-2"><div class="flex items-center justify-between mb-4"><h3 class="font-bold text-slate-800"><i class="bi bi-clock-history text-purple-500"></i> Recent MAK licenses</h3><a href="/sdk/keys" class="text-xs font-bold text-purple-600">View all →</a></div>' + recentHtml + '</div>'
    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-4"><i class="bi bi-lightning-charge-fill text-amber-500"></i> Quick actions</h3>'
    + '<div class="space-y-2">'
    + '<a href="/sdk/generate" class="clay-card p-3 rounded-2xl flex items-center gap-3"><i class="bi bi-key-fill text-purple-500"></i><span class="text-sm font-bold flex-1">Generate MAK</span><i class="bi bi-chevron-right text-slate-400"></i></a>'
    + '<a href="/sdk/keys" class="clay-card p-3 rounded-2xl flex items-center gap-3"><i class="bi bi-view-list text-blue-500"></i><span class="text-sm font-bold flex-1">MAK keys</span><i class="bi bi-chevron-right text-slate-400"></i></a>'
    + '<a href="/sdk/devices" class="clay-card p-3 rounded-2xl flex items-center gap-3"><i class="bi bi-phone-fill text-emerald-500"></i><span class="text-sm font-bold flex-1">Devices</span><i class="bi bi-chevron-right text-slate-400"></i></a>'
    + '<a href="/sdk/guests" class="clay-card p-3 rounded-2xl flex items-center gap-3"><i class="bi bi-app-indicator text-amber-500"></i><span class="text-sm font-bold flex-1">Guest apps</span><i class="bi bi-chevron-right text-slate-400"></i></a>'
    + '</div></div></div>'
    + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">'
    + '<div class="glass-card p-4"><p class="text-[10px] font-extrabold text-slate-400 uppercase">Guest apps</p><p class="text-xl font-black">' + Number(stats.guests || 0) + '</p></div>'
    + '<div class="glass-card p-4"><p class="text-[10px] font-extrabold text-slate-400 uppercase">New (7 days)</p><p class="text-xl font-black">' + Number(stats.new_licenses || 0) + '</p></div>'
    + '<div class="glass-card p-4"><p class="text-[10px] font-extrabold text-slate-400 uppercase">Activations</p><p class="text-xl font-black">' + Number(stats.activations || 0) + '</p></div>'
    + '<div class="glass-card p-4"><p class="text-[10px] font-extrabold text-slate-400 uppercase">Signing</p><p class="text-sm font-black ' + (server.signingReady ? 'text-emerald-600' : 'text-amber-600') + '">' + (server.signingReady ? 'Ed25519 ready' : 'Key missing') + '</p></div>'
    + '</div>';
}

export function generatePage(o) {
  const values = o.values || {};
  const server = o.server || {};
  const guests = o.guests || [];

  let notice = '';
  if (o.success) {
    const s = o.success;
    notice = '<div class="glass-card p-5 mb-6" style="border-left:4px solid #10b981">'
      + '<p class="text-xs font-extrabold uppercase tracking-wider text-emerald-600">MAK issued successfully</p>'
      + '<p class="text-sm font-bold text-slate-800 mt-1">' + esc(s.license && (s.license.label || s.license.license_uid) || 'New license') + '</p>'
      + '<div class="clay-card p-3 flex items-center gap-2 mt-3 rounded-2xl"><code id="new-mak" class="flex-1 text-sm md:text-base font-mono font-bold text-slate-800 break-all">' + esc(s.credential) + '</code>'
      + '<button type="button" onclick="copyMak()" class="btn-premium px-3 py-2 rounded-xl text-xs font-bold"><i class="bi bi-clipboard"></i> Copy</button></div>'
      + '<p class="text-[11px] text-amber-700 mt-2"><i class="bi bi-exclamation-triangle-fill"></i> This is the only time the raw MAK is shown. Store it now.</p>'
      + '<div class="flex flex-wrap gap-2 mt-3"><a href="/sdk/keys/' + Number(s.licenseId) + '" class="clay-card px-3 py-2 text-xs font-bold rounded-xl">Open license</a><a href="/sdk/generate" class="btn-premium px-3 py-2 text-xs font-bold rounded-xl">Issue another</a></div></div>';
  }
  if (o.error) {
    notice = '<div class="glass-card p-4 mb-6" style="border-left:4px solid #ef4444"><p class="text-xs font-bold text-red-700"><i class="bi bi-exclamation-circle-fill mr-1"></i> ' + esc(o.error) + '</p></div>';
  }
  if (!server.signingReady) {
    notice += '<div class="glass-card p-4 mb-6" style="border-left:4px solid #f59e0b"><p class="text-xs text-amber-700"><i class="bi bi-shield-exclamation mr-1"></i> Signing key is not configured. You can issue MAKs, but activation decisions will be denied until <code>MAK_SIGNING_KEY</code> is set.</p></div>';
  }

  const guestCards = guests.length ? guests.map((g) =>
    '<label class="feature-card' + ((values.guest_ids || []).includes(String(g.id)) ? ' checked' : '') + '"><input type="checkbox" name="guest_ids" value="' + Number(g.id) + '" ' + ((values.guest_ids || []).includes(String(g.id)) ? 'checked' : '') + ' onchange="toggleFeature(this)"><span class="text-sm font-bold text-slate-700">' + esc(g.app_name || g.package_name) + '</span></label>'
  ).join('') : '<p class="text-xs text-slate-400 italic">No approved guest apps. You can bind them later from the MAK settings.</p>';

  return notice
    + '<div class="pagehead"><div class="ph-ic"><i class="bi bi-key-fill"></i></div><div class="flex-1 min-w-0"><h1 class="truncate">Generate MAK</h1><p class="truncate">Issue a new activation credential for a host application</p></div></div>'
    + '<form method="POST" action="/sdk/generate" class="glass-card p-5 md:p-7">'
    + '<input type="hidden" name="_csrf" value="' + esc(o.csrf || '') + '">'
    + '<div class="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200"><div class="w-12 h-12 rounded-2xl avatar-premium flex items-center justify-center text-white shadow-lg"><i class="bi bi-cpu-fill text-xl"></i></div><div><h3 class="font-black text-slate-800">MAK /1 License</h3><p class="text-xs text-slate-500">Raw credential is shown once and stored only as a SHA-256 verifier.</p></div></div>'
    + '<div class="grid md:grid-cols-2 gap-4">'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Label <span class="text-red-500">*</span></label><input name="label" value="' + esc(values.label || '') + '" required maxlength="80" placeholder="e.g. Rahul monthly" class="w-full clay-card px-4 py-3 text-sm rounded-2xl"></div>'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">User reference</label><input name="user_ref" value="' + esc(values.user_ref || '') + '" maxlength="120" placeholder="Name, email or order ID" class="w-full clay-card px-4 py-3 text-sm rounded-2xl"></div>'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Expires on <span class="text-red-500">*</span></label><input type="date" name="expires_on" value="' + esc(values.expires_on || o.defaultExpiry || '') + '" required class="w-full clay-card px-4 py-3 text-sm rounded-2xl"></div>'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Session TTL (seconds)</label><input type="number" name="session_ttl" min="300" max="86400" value="' + esc(values.session_ttl || 3600) + '" required class="w-full clay-card px-4 py-3 text-sm rounded-2xl"></div>'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Max devices</label><input type="number" name="max_devices" min="1" max="100" value="' + esc(values.max_devices || 1) + '" required class="w-full clay-card px-4 py-3 text-sm rounded-2xl"></div>'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Max activations</label><input type="number" name="max_activations" min="1" max="1000" value="' + esc(values.max_activations || 2) + '" required class="w-full clay-card px-4 py-3 text-sm rounded-2xl"></div>'
    + '</div>'
    + '<div class="mt-5"><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Notes</label><textarea name="notes" maxlength="1000" placeholder="Internal note (never sent to the client)" class="w-full clay-card px-4 py-3 text-sm rounded-2xl">' + esc(values.notes || '') + '</textarea></div>'
    + '<div class="mt-5 pt-5 border-t border-slate-200"><h4 class="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-3">Host binding</h4>'
    + '<div class="grid md:grid-cols-2 gap-4">'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Host package name</label><input name="host_package" value="' + esc(values.host_package || '') + '" maxlength="200" placeholder="com.example.host" class="w-full clay-card px-4 py-3 text-sm font-mono rounded-2xl"></div>'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Certificate SHA-256</label><input name="host_cert" value="' + esc(values.host_cert || '') + '" maxlength="80" placeholder="64 hex characters" class="w-full clay-card px-4 py-3 text-sm font-mono rounded-2xl"></div>'
    + '<div class="md:col-span-2"><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Binding mode</label><select name="host_bind_mode" class="w-full clay-card custom-select px-4 py-3 text-sm font-semibold rounded-2xl"><option value="FIRST_USE"' + (values.host_bind_mode !== 'STRICT' ? ' selected' : '') + '>Bind on first authentication</option><option value="STRICT"' + (values.host_bind_mode === 'STRICT' ? ' selected' : '') + '>Strict — require pre-registered host</option></select></div>'
    + '</div><p class="text-[11px] text-slate-500 mt-2"><i class="bi bi-shield-lock-fill"></i> Leave the host fields empty to allow first-use binding, protected by MAK + device proof.</p></div>'
    + '<div class="mt-5 pt-5 border-t border-slate-200"><h4 class="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-3">Guest access</h4><div class="grid grid-cols-2 gap-3">' + guestCards + '</div></div>'
    + '<button type="submit" class="btn-premium w-full py-4 rounded-2xl font-extrabold text-sm uppercase tracking-wider mt-6"><i class="bi bi-magic"></i> Generate MAK</button>'
    + '</form>'
    + '<script>function toggleFeature(cb){const c=cb.closest(".feature-card");if(cb.checked)c.classList.add("checked");else c.classList.remove("checked");}function copyMak(){const el=document.getElementById("new-mak");if(!el)return;navigator.clipboard.writeText(el.textContent.trim()).then(function(){alert("MAK copied");});}</script>';
}
