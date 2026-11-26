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
    warnings.push('<div class="glass-card p-4 mb-4" style="border-left:4px solid #ef4444"><p class="font-bold text-red-700 text-sm"><i class="bi bi-exclamation-circle-fill mr-1"></i> Activation server is OFF</p><p class="text-xs text-slate-600 mt-1">Every MAK/2 activate / host / guest / status request is denied. Turn it on from <a class="underline font-bold" href="/sdk/server">Server</a>.</p></div>');
  }
  if (!server.signingReady) {
    warnings.push('<div class="glass-card p-4 mb-4" style="border-left:4px solid #f59e0b"><p class="font-bold text-amber-700 text-sm"><i class="bi bi-shield-exclamation mr-1"></i> MAK/2 keys not generated</p><p class="text-xs text-slate-600 mt-1">MAK issuance works, but every signed decision fails closed until keys exist. Open <a class="underline font-bold" href="/sdk/server">Server &amp; API</a> and press <b>Generate MAK/2 keys</b>. The Ed25519 + X25519 keys are created in D1 — no Worker secret is needed.</p></div>');
  }

  const recentHtml = recent.length ? recent.map((l) =>
    '<div class="clay-card p-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl">'
    + '<div class="min-w-0 flex-1"><p class="text-sm font-bold text-slate-800 truncate">' + esc(l.label || l.license_uid) + '</p>'
    + '<p class="text-[10px] font-mono text-slate-400 mt-0.5">' + esc(l.license_uid) + (l.host_package ? ' · ' + esc(l.host_package) : '') + '</p></div>'
    + '<div class="flex items-center gap-2">' + statusChip(l.status)
    + '<span class="text-[10px] text-slate-400">' + esc(fmtDate(l.expires_at)) + '</span>'
    + '<a href="/sdk/keys?q=' + encodeURIComponent(l.license_uid) + '" class="clay-card px-3 py-1.5 text-xs font-bold text-slate-600 rounded-xl">Open</a></div></div>'
  ).join('') : '<div class="text-center py-8 text-slate-400"><i class="bi bi-inbox text-4xl mb-2 opacity-40"></i><p class="text-sm">No MAK issued yet</p><a href="/sdk/generate" class="inline-block mt-2 text-xs font-bold text-emerald-600 hover:underline">Generate the first MAK →</a></div>';

  return warnings.join('')
    + '<div class="pagehead"><div class="ph-ic"><i class="bi bi-speedometer2"></i></div><div class="flex-1 min-w-0"><h1 class="truncate">MAK Dashboard</h1><p class="truncate">Activation licenses, host packages and guest apps</p></div></div>'
    + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">'
    + statCard('Total', stats.total || 0, 'MAK licenses issued', 'bi-key-fill', 'bg-emerald-500')
    + statCard('Active', stats.active || 0, 'Ready for activation', 'bi-check-circle-fill', 'bg-emerald-500')
    + statCard('Host packages', stats.hosts || 0, 'Pinned package identities', 'bi-hdd-stack-fill', 'bg-blue-500')
    + statCard('Guest apps', stats.guests || 0, 'Approved APK identities', 'bi-app-indicator', 'bg-amber-500')
    + '</div>'
    + '<div class="grid lg:grid-cols-3 gap-4 mb-6">'
    + '<div class="glass-card p-5 lg:col-span-2"><div class="flex items-center justify-between mb-4"><h3 class="font-bold text-slate-800"><i class="bi bi-clock-history text-emerald-500"></i> Recent MAK licenses</h3><a href="/sdk/keys" class="text-xs font-bold text-emerald-600">View all →</a></div>' + recentHtml + '</div>'
    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-4"><i class="bi bi-lightning-charge-fill text-amber-500"></i> Quick actions</h3>'
    + '<div class="space-y-2">'
    + '<a href="/sdk/generate" class="clay-card p-3 rounded-2xl flex items-center gap-3"><i class="bi bi-key-fill text-emerald-500"></i><span class="text-sm font-bold flex-1">Generate MAK</span><i class="bi bi-chevron-right text-slate-400"></i></a>'
    + '<a href="/sdk/keys" class="clay-card p-3 rounded-2xl flex items-center gap-3"><i class="bi bi-view-list text-blue-500"></i><span class="text-sm font-bold flex-1">MAK keys</span><i class="bi bi-chevron-right text-slate-400"></i></a>'
    + '<a href="/sdk/hosts" class="clay-card p-3 rounded-2xl flex items-center gap-3"><i class="bi bi-hdd-stack-fill text-blue-500"></i><span class="text-sm font-bold flex-1">Host packages</span><i class="bi bi-chevron-right text-slate-400"></i></a>'
    + '<a href="/sdk/guests" class="clay-card p-3 rounded-2xl flex items-center gap-3"><i class="bi bi-app-indicator text-amber-500"></i><span class="text-sm font-bold flex-1">Guest apps</span><i class="bi bi-chevron-right text-slate-400"></i></a>'
    + '</div></div></div>'
    + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">'
    + '<div class="glass-card p-4"><p class="text-[10px] font-extrabold text-slate-400 uppercase">Active grants</p><p class="text-xl font-black">' + Number(stats.grants || 0) + '</p></div>'
    + '<div class="glass-card p-4"><p class="text-[10px] font-extrabold text-slate-400 uppercase">New (7 days)</p><p class="text-xl font-black">' + Number(stats.new_licenses || 0) + '</p></div>'
    + '<div class="glass-card p-4"><p class="text-[10px] font-extrabold text-slate-400 uppercase">Activations</p><p class="text-xl font-black">' + Number(stats.activations || 0) + '</p></div>'
    + '<div class="glass-card p-4"><p class="text-[10px] font-extrabold text-slate-400 uppercase">Signing</p><p class="text-sm font-black ' + (server.signingReady ? 'text-emerald-600' : 'text-amber-600') + '">' + (server.signingReady ? 'Ed25519 ready' : 'Not generated') + '</p></div>'
    + '</div>';
}

export function generatePage(o) {
  const values = o.values || {};
  const server = o.server || {};
  const signatureBind = String(values.signature_bind ?? '1') !== '0';
  const manualBind = String(values.host_bind_mode || 'AUTO').toUpperCase() === 'MANUAL';

  let notice = '';
  if (o.success) {
    const s = o.success;
    notice = '<div class="glass-card p-5 mb-6" style="border-left:4px solid #10b981">'
      + '<p class="text-xs font-extrabold uppercase tracking-wider text-emerald-600">MAK issued successfully</p>'
      + '<p class="text-sm font-bold text-slate-800 mt-1">' + esc(s.license && (s.license.label || s.license.license_uid) || 'New license') + '</p>'
      + '<div class="clay-card p-3 flex items-center gap-2 mt-3 rounded-2xl"><code id="new-mak" class="flex-1 text-sm md:text-base font-mono font-bold text-slate-800 break-all">' + esc(s.credential) + '</code>'
      + '<button type="button" onclick="copyMak()" class="btn-premium px-3 py-2 rounded-xl text-xs font-bold"><i class="bi bi-clipboard"></i> Copy</button></div>'
      + '<p class="text-[11px] text-amber-700 mt-2"><i class="bi bi-exclamation-triangle-fill"></i> This is the only time the raw MAK is shown. Store it now.</p>'
      + '<div class="flex flex-wrap gap-2 mt-3"><a href="/sdk/keys?q=' + encodeURIComponent((s.license && s.license.license_uid) || '') + '" class="clay-card px-3 py-2 text-xs font-bold rounded-xl">Open license</a><a href="/sdk/generate" class="btn-premium px-3 py-2 text-xs font-bold rounded-xl">Issue another</a></div></div>';
  }
  if (o.error) {
    notice = '<div class="glass-card p-4 mb-6" style="border-left:4px solid #ef4444"><p class="text-xs font-bold text-red-700"><i class="bi bi-exclamation-circle-fill mr-1"></i> ' + esc(o.error) + '</p></div>';
  }
  if (!server.signingReady) {
    notice += '<div class="glass-card p-4 mb-6" style="border-left:4px solid #f59e0b"><p class="text-xs text-amber-700"><i class="bi bi-shield-exclamation mr-1"></i> MAK/2 keys are not generated yet. You can issue MAKs, but activation decisions will be denied until you open <a class="underline font-bold" href="/sdk/server">Server &amp; API</a> and press <b>Generate MAK/2 keys</b>. No Worker secret is needed.</p></div>';
  }

  const field = (label, input, hint) =>
    '<div><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">' + label + '</label>'
    + input
    + (hint ? '<p class="text-[10px] text-slate-400 mt-1">' + hint + '</p>' : '') + '</div>';

  const input = (name, value, attrs = '') =>
    '<input name="' + name + '" value="' + esc(value || '') + '" ' + attrs + ' class="w-full clay-card px-4 py-3 text-sm rounded-2xl">';

  const durationOptions = [
    ['1', '1 day'], ['3', '3 days'], ['7', '7 days'], ['14', '14 days'],
    ['30', '30 days'], ['60', '60 days'], ['90', '90 days'], ['180', '180 days'],
    ['365', '1 year'], ['730', '2 years'], ['lifetime', 'Lifetime (no expiry)'],
    ['custom', 'Custom date…'],
  ];
  const durationSelect = '<select name="duration" id="mak-duration" onchange="toggleCustomExpiry()" class="w-full clay-card custom-select px-4 py-3 text-sm font-semibold rounded-2xl">'
    + durationOptions.map(([v, label]) => '<option value="' + v + '"' + (String(values.duration || '30') === v ? ' selected' : '') + '>' + label + '</option>').join('')
    + '</select>';

  const signatureOptions = '<select name="signature_bind" id="mak-signature-bind" onchange="toggleSignatureBind()" class="w-full clay-card custom-select px-4 py-3 text-sm font-semibold rounded-2xl">'
    + '<option value="1"' + (signatureBind ? ' selected' : '') + '>Yes — verify APK signature</option>'
    + '<option value="0"' + (!signatureBind ? ' selected' : '') + '>No — package + app name only</option>'
    + '</select>';

  const sigClass = signatureBind ? 'sig-field' : 'sig-field hidden';

  const bindToggle = '<label class="clay-card flex items-center justify-between gap-3 px-4 py-3 rounded-2xl cursor-pointer">'
    + '<span class="min-w-0"><span class="block text-sm font-bold text-slate-800">Manual bind</span><span class="block text-[10px] text-slate-400">OFF: pehla use khud bind hoga. ON: sirf niche diya package allow hoga.</span></span>'
    + '<input type="checkbox" name="manual_bind" value="1" id="mak-manual-bind"' + (manualBind ? ' checked' : '') + ' onchange="toggleManualBind()" class="w-5 h-5 accent-emerald-600 shrink-0">'
    + '</label>';

  const manualCard = '<div id="mak-manual-card" class="clay-card p-4 rounded-2xl space-y-3 ' + (manualBind ? '' : 'hidden') + '">'
    + field('Host package', input('host_package', values.host_package, 'maxlength="200" placeholder="com.example.host"'))
    + field('Host app name', input('host_app_name', values.host_app_name, 'maxlength="120" placeholder="Display name"'))
    + '<div class="' + sigClass + '">' + field('Host signature (SHA-256)', input('host_cert', values.host_cert, 'maxlength="80" placeholder="64 hex characters"')) + '</div>'
    + '</div>';

  const existingRows = Array.isArray(values.guest_rows) && values.guest_rows.length
    ? values.guest_rows
    : Array.from({ length: 2 }, () => ({ app_name: '', package_name: '', cert_sha256: '' }));

  const guestRow = (row) =>
    '<div class="guest-row clay-card p-3 rounded-2xl mb-3">'
    + '<div class="grid md:grid-cols-12 gap-3 items-end">'
    + '<div class="md:col-span-4"><label class="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">App name</label><input name="guest_app_name" value="' + esc(row.app_name || '') + '" maxlength="120" placeholder="e.g. WhatsApp" class="w-full clay-card px-3 py-2 text-sm rounded-xl"></div>'
    + '<div class="md:col-span-4"><label class="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Package name</label><input name="guest_package" value="' + esc(row.package_name || '') + '" maxlength="200" placeholder="com.example.guest" class="w-full clay-card px-3 py-2 text-sm font-mono rounded-xl"></div>'
    + '<div class="md:col-span-3 ' + sigClass + '"><label class="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Signature (SHA-256)</label><input name="guest_cert" value="' + esc(row.cert_sha256 || '') + '" maxlength="80" placeholder="64 hex" class="w-full clay-card px-3 py-2 text-sm font-mono rounded-xl"></div>'
    + '<div class="md:col-span-1 flex justify-end"><button type="button" onclick="removeGuestRow(this)" class="clay-card w-9 h-9 rounded-xl text-red-500 font-black" title="Remove">×</button></div>'
    + '</div></div>';

  return notice
    + '<div class="pagehead"><div class="ph-ic"><i class="bi bi-key-fill"></i></div><div class="flex-1 min-w-0"><h1 class="truncate">Generate MAK</h1><p class="truncate">Clean app-locked license for MUNDO</p></div></div>'
    + '<form method="POST" action="/sdk/generate" class="glass-card p-5 md:p-7" id="mak-form">'
    + '<input type="hidden" name="_csrf" value="' + esc(o.csrf || '') + '">'
    + '<div class="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200"><div class="w-12 h-12 rounded-2xl avatar-premium flex items-center justify-center text-white shadow-lg"><i class="bi bi-cpu-fill text-xl"></i></div><div><h3 class="font-black text-slate-800">MAK /2 License</h3><p class="text-xs text-slate-500">App-locked grant. Raw key stays in D1 and can be revealed from MAK Keys.</p></div></div>'
    + '<div class="grid lg:grid-cols-2 gap-5">'
    + '<div class="space-y-4">'
    + field('Custom MAK key', input('custom_key', values.custom_key, 'maxlength="120" placeholder="Koi bhi key — blank = random"'), 'Koi fixed length nahi. Jo likhoge bilkul wahi key chalegi (case-sensitive).')
    + field('Label <span class="text-red-500">*</span>', input('label', values.label, 'required maxlength="80" placeholder="e.g. Rahul monthly"'))
    + field('Duration <span class="text-red-500">*</span>', durationSelect, 'Expiry grant me signed hoti hai; AAR device clock se check karega.')
    + '<div id="mak-custom-expiry" style="display:' + (String(values.duration || '30') === 'custom' ? 'block' : 'none') + '"><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Custom expiry date</label><input type="date" name="expires_on" value="' + esc(values.expires_on || o.defaultExpiry || '') + '" class="w-full clay-card px-4 py-3 text-sm rounded-2xl"></div>'
    + '<div class="grid grid-cols-2 gap-3">'
    + field('Package limit', '<input type="number" name="max_packages" id="mak-max-packages" min="1" max="100" value="' + esc(values.max_packages || 1) + '" required class="w-full clay-card px-4 py-3 text-sm rounded-2xl">', 'Kitne host packages is MAK par bind honge.')
    + field('Cloned app limit', '<input type="number" name="guest_app_limit" id="mak-guest-limit" min="1" max="1000" placeholder="Unlimited" value="' + esc(values.guest_app_limit || '') + '" class="w-full clay-card px-4 py-3 text-sm rounded-2xl">', 'Blank = unlimited. Har unique APK package + app name ek cloned app hai; same app ka naya version slot nahi khata.')
    + '</div>'
    + '<input type="hidden" name="host_bind_mode" id="mak-bind-mode" value="' + (manualBind ? 'MANUAL' : 'AUTO') + '">'
    + '</div>'
    + '<div class="space-y-4">'
    + field('Signature Bind', signatureOptions, 'Yes = host aur har app ka signing certificate verify hoga. No = sirf package + app name.')
    + bindToggle
    + manualCard
    + '</div>'
    + '</div>'
    + '<details class="mt-6 pt-5 border-t border-slate-200">'
    + '<summary class="cursor-pointer flex items-center justify-between gap-3"><div><h4 class="text-xs font-extrabold text-slate-500 uppercase tracking-wider">App names pre-bind <span class="text-slate-300">(optional)</span></h4><p class="text-[10px] text-slate-400">AUTO me runtime par bhi bind ho sakte hain. Abhi bharna zaroori nahi.</p></div><span class="clay-card px-3 py-2 text-xs font-bold text-emerald-600 rounded-xl"><i class="bi bi-chevron-down"></i></span></summary>'
    + '<div class="mt-4"><div class="flex items-center justify-end mb-2"><button type="button" onclick="addGuestRow()" class="clay-card px-3 py-2 text-xs font-bold text-emerald-600 rounded-xl"><i class="bi bi-plus-lg"></i> Add app</button></div>'
    + '<div id="guest-rows">' + existingRows.map(guestRow).join('') + '</div></div>'
    + '</details>'
    + '<div class="mt-5"><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Notes</label><textarea name="notes" maxlength="1000" placeholder="Internal note (never sent to the client)" class="w-full clay-card px-4 py-3 text-sm rounded-2xl">' + esc(values.notes || '') + '</textarea></div>'
    + '<button type="submit" class="btn-premium w-full py-4 rounded-2xl font-extrabold text-sm uppercase tracking-wider mt-6"><i class="bi bi-magic"></i> Generate MAK</button>'
    + '</form>'
    + '<script>'
    + 'function toggleCustomExpiry(){var d=document.getElementById("mak-duration");var box=document.getElementById("mak-custom-expiry");if(!d||!box)return;box.style.display=d.value==="custom"?"block":"none";}'
    + 'function toggleSignatureBind(){var el=document.getElementById("mak-signature-bind");var on=!el||el.value==="1";document.querySelectorAll(".sig-field").forEach(function(f){f.classList.toggle("hidden",!on);});}'
    + 'function toggleManualBind(){var on=document.getElementById("mak-manual-bind").checked;var card=document.getElementById("mak-manual-card");var mode=document.getElementById("mak-bind-mode");if(card)card.classList.toggle("hidden",!on);if(mode)mode.value=on?"MANUAL":"AUTO";}'
    + 'function addGuestRow(){var box=document.getElementById("guest-rows");if(!box||!box.firstElementChild)return;var div=document.createElement("div");div.className="guest-row clay-card p-3 rounded-2xl mb-3";div.innerHTML=box.firstElementChild.innerHTML;div.querySelectorAll("input").forEach(function(i){i.value="";});box.appendChild(div);toggleSignatureBind();}'
    + 'function removeGuestRow(btn){var row=btn.closest(".guest-row");if(row)row.remove();}'
    + 'function copyMak(){const el=document.getElementById("new-mak");if(!el)return;navigator.clipboard.writeText(el.textContent.trim()).then(function(){alert("MAK copied");});}'
    + 'document.addEventListener("DOMContentLoaded",function(){toggleSignatureBind();toggleManualBind();});'
    + '</script>';
}
