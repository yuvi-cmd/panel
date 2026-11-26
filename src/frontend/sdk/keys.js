import { esc } from '../ui.js';

function fmtDate(seconds) {
  if (!seconds) return 'Lifetime';
  const d = new Date(Number(seconds) * 1000);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusChip(status) {
  const s = String(status || '').toUpperCase();
  const cls = s === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600'
    : s === 'SUSPENDED' || s === 'NOT YET STARTED' ? 'bg-amber-50 text-amber-600'
      : 'bg-red-50 text-red-600';
  return '<span class="text-[10px] font-extrabold px-2 py-1 rounded-lg uppercase ' + cls + '">' + esc(s || 'UNKNOWN') + '</span>';
}

function effectiveLicenseStatus(l) {
  const status = String(l.status || 'ACTIVE').toUpperCase();
  if (status === 'SUSPENDED' || status === 'REVOKED') return status;
  if (Number(l.duration_days) > 0 && !l.started_at) return 'NOT YET STARTED';
  if (l.expires_at && Number(l.expires_at) <= Math.floor(Date.now() / 1000)) return 'EXPIRED';
  return 'ACTIVE';
}

function expiryLabel(l) {
  if (Number(l.duration_days) > 0 && !l.started_at) {
    return 'Not started · ' + Number(l.duration_days) + 'd';
  }
  return fmtDate(l.expires_at);
}

const EXTEND_OPTIONS = [
  ['7', '+7 days'], ['30', '+30 days'], ['90', '+90 days'],
  ['180', '+180 days'], ['365', '+1 year'], ['lifetime', 'Lifetime'],
];

function actionForm(csrf, licenseId, inner) {
  return '<form method="post" action="/sdk/keys/' + Number(licenseId) + '/action" class="clay-card p-3 rounded-2xl">'
    + '<input type="hidden" name="_csrf" value="' + esc(csrf || '') + '">'
    + inner + '</form>';
}

function infoRow(label, value) {
  return '<div><p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">' + label + '</p>'
    + '<p class="text-xs font-bold text-slate-700 mt-0.5 break-all">' + value + '</p></div>';
}

export function keysPage(o) {
  const licenses = o.licenses || [];
  const counts = o.counts || {};
  const q = o.q || '';
  const status = o.status || 'ALL';
  const csrf = o.csrf || '';

  const hostsByLicense = new Map();
  for (const h of (o.hosts || [])) {
    const key = Number(h.license_id);
    if (!hostsByLicense.has(key)) hostsByLicense.set(key, []);
    hostsByLicense.get(key).push(h);
  }

  const filters = [['ALL', 'All', counts.total], ['ACTIVE', 'Active', counts.active], ['SUSPENDED', 'Suspended', counts.suspended], ['EXPIRED', 'Expired', counts.expired], ['REVOKED', 'Revoked', counts.revoked]];
  const filterHtml = '<div class="flex flex-wrap gap-2 mb-4">' + filters.map(([value, label, count]) =>
    '<a href="/sdk/keys?status=' + encodeURIComponent(value) + (q ? '&q=' + encodeURIComponent(q) : '') + '" class="clay-card px-3 py-1.5 text-xs font-bold rounded-xl ' + (status === value ? 'text-emerald-600' : 'text-slate-500') + '">' + esc(label) + ' <span class="opacity-60">' + Number(count || 0) + '</span></a>'
  ).join('') + '</div>';

  const rows = licenses.length ? licenses.map((l) => {
    const id = Number(l.id);
    const pkgCount = Number(l.package_count || 0);
    const hosts = hostsByLicense.get(id) || [];
    const maxPackages = Number(l.max_packages || 1);
    const hostAppLimit = Number(l.host_app_limit || 1);
    const maxHostApps = Number(l.host_app_count || 0);
    const guestLimit = l.guest_app_limit == null || l.guest_app_limit === '' ? 0 : Number(l.guest_app_limit);
    const clonedApps = Number(l.guest_app_count || 0);

    const hostList = hosts.length ? hosts.map((h) => {
      const blocked = String(h.status || '').toUpperCase() !== 'ACTIVE';
      return '<div class="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">'
        + '<div class="min-w-0"><p class="text-[11px] font-bold font-mono text-slate-700 break-all">' + esc(h.package_name) + '</p>'
        + '<p class="text-[10px] text-slate-400 break-all">' + esc(h.app_name || '—') + (h.cert_sha256 ? ' · ' + esc(String(h.cert_sha256).slice(0, 12)) + '…' : '') + '</p></div>'
        + '<div class="flex items-center gap-2">' + statusChip(h.status)
        + '<button form="block-' + Number(h.id) + '" class="px-2.5 py-1 rounded-lg text-[10px] font-extrabold ' + (blocked ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600') + '">' + (blocked ? 'Unblock' : 'Block') + '</button>'
        + '<button form="delete-host-' + Number(h.id) + '" class="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-red-50 text-red-600">Delete</button></div></div>';
    }).join('') : '<p class="text-[11px] text-slate-400">Abhi koi package bind nahi hua.</p>';

    const blockForms = hosts.map((h) => {
      const blocked = String(h.status || '').toUpperCase() !== 'ACTIVE';
      return '<form id="block-' + Number(h.id) + '" method="post" action="/sdk/keys/' + id + '/action" class="hidden">'
        + '<input type="hidden" name="_csrf" value="' + esc(csrf) + '">'
        + '<input type="hidden" name="action" value="' + (blocked ? 'host_unblock' : 'host_block') + '">'
        + '<input type="hidden" name="host_id" value="' + Number(h.id) + '"></form>'
        + '<form id="delete-host-' + Number(h.id) + '" method="post" action="/sdk/keys/' + id + '/action" class="hidden" onsubmit="return confirm(\'Delete this host app identity? Its grants, sessions and host-scoped guest bindings are removed. Its app-name slot becomes free; the package slot frees only when no app names remain.\')">'
        + '<input type="hidden" name="_csrf" value="' + esc(csrf) + '">'
        + '<input type="hidden" name="action" value="host_delete">'
        + '<input type="hidden" name="host_id" value="' + Number(h.id) + '"></form>';
    }).join('');

    const details = '<details id="mak-details-' + id + '" class="mt-3">'
      + '<summary class="cursor-pointer text-[11px] font-extrabold uppercase tracking-wider text-emerald-600 select-none">MAK details &amp; quick actions</summary>'
      + '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">'
      + infoRow('License ID', '<span class="font-mono">' + esc(l.license_uid) + '</span>')
      + infoRow('Binding', esc(String(l.host_bind_mode || 'AUTO') === 'MANUAL' ? 'Manual' : 'AUTO (first use)'))
      + infoRow('Signature', Number(l.signature_bind ?? 1) ? 'Verify cert' : 'Package + app name')
      + infoRow('Expiry', esc(expiryLabel(l)))
      + infoRow('Package limit', pkgCount + ' / ' + maxPackages + ' used')
      + infoRow('App names', maxHostApps + ' / ' + hostAppLimit + ' per package')
      + infoRow('Cloned apps', guestLimit
        ? clonedApps + ' / ' + guestLimit + ' per host app'
        : 'Unlimited · identity checked')
      + infoRow('User ref', l.user_ref ? esc(l.user_ref) : '—')
      + '</div>'
      + '<div class="grid md:grid-cols-2 gap-3 mt-3">'
      + actionForm(csrf, id, '<p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Extend duration</p>'
        + '<input type="hidden" name="action" value="extend_duration">'
        + '<div class="flex gap-2"><select name="extend_days" class="clay-card custom-select px-3 py-2 text-xs font-bold rounded-xl flex-1">'
        + EXTEND_OPTIONS.map(([v, label]) => '<option value="' + v + '"' + (v === '30' ? ' selected' : '') + '>' + label + '</option>').join('')
        + '</select><button class="btn-premium px-3 py-2 rounded-xl text-[11px] font-extrabold">Extend</button></div>')
      + actionForm(csrf, id, '<p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Extend limits</p>'
        + '<input type="hidden" name="action" value="extend_limits">'
        + '<div class="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">'
        + '<div><p class="text-[9px] text-slate-400 font-bold mb-1">HOST PACKAGES</p><input type="number" name="max_packages" min="1" max="100" value="' + maxPackages + '" class="w-full clay-card px-2 py-2 text-xs rounded-lg"></div>'
        + '<div><p class="text-[9px] text-slate-400 font-bold mb-1">APP NAMES / PKG</p><input type="number" name="host_app_limit" min="1" max="100" value="' + hostAppLimit + '" class="w-full clay-card px-2 py-2 text-xs rounded-lg"></div>'
        + '<div><p class="text-[9px] text-slate-400 font-bold mb-1">CLONED / HOST APP</p><input type="number" name="guest_app_limit" min="1" max="1000" placeholder="Unlimited" value="' + (guestLimit || '') + '" class="w-full clay-card px-2 py-2 text-xs rounded-lg"></div>'
        + '<button class="btn-premium px-2 py-2 rounded-lg text-[10px] font-extrabold">Save</button>'
        + '</div>')
      + '</div>'
      + actionForm(csrf, id, '<p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Add / update host app</p>'
        + '<input type="hidden" name="action" value="host_save">'
        + '<div class="grid grid-cols-2 gap-2 mb-2">'
        + '<input name="host_package" maxlength="200" placeholder="com.example.host" required class="clay-card px-3 py-2 text-xs font-mono rounded-lg">'
        + '<input name="host_app_name" maxlength="120" placeholder="App name (e.g. Dura plays)" required class="clay-card px-3 py-2 text-xs rounded-lg">'
        + '</div>'
        + '<div class="flex gap-2"><input name="host_cert" maxlength="80" placeholder="Certificate SHA-256 (64 hex)" class="clay-card px-3 py-2 text-xs font-mono rounded-lg flex-1">'
        + '<button class="clay-card px-3 py-2 rounded-lg text-[10px] font-extrabold text-emerald-600">Add app</button></div>')
      + '<div class="mt-3"><p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Bound packages</p>' + hostList + '</div>'
      + blockForms
      + '<div class="mt-4 pt-3 border-t border-red-100">'
      + '<p class="text-[10px] font-extrabold uppercase tracking-wider text-red-400 mb-1">Danger zone</p>'
      + '<form method="post" action="/sdk/keys/' + id + '/action" onsubmit="return confirm(\'Delete this MAK permanently? All hosts, guest bindings, grants and tickets will be removed. This cannot be undone.\')">'
      + '<input type="hidden" name="_csrf" value="' + esc(csrf) + '">'
      + '<input type="hidden" name="action" value="delete">'
      + '<button type="submit" class="w-full px-3 py-2 rounded-xl text-[11px] font-extrabold bg-red-50 text-red-600 hover:bg-red-100"><i class="bi bi-trash3 mr-1"></i> Delete MAK</button>'
      + '</form></div>'
      + '</details>';

    const hostLine = l.host_package
      ? '<span class="text-[10px] font-mono text-slate-500 break-all">' + esc(l.host_package) + (pkgCount > 1 ? ' +' + (pkgCount - 1) + ' more' : '') + '</span>'
      : '<span class="text-[10px] text-slate-400">' + (String(l.host_bind_mode || 'AUTO') === 'MANUAL' ? 'Manual / unbound' : 'Auto / unbound') + '</span>';

    const secret = String(l.credential_plain || '');
    const secretBox = secret
      ? '<div class="clay-card p-2.5 mt-3 flex items-center gap-2 rounded-2xl">'
        + '<code id="mak-key-' + id + '" data-hidden="1" class="flex-1 text-xs font-mono font-bold text-slate-700 break-all" style="filter:blur(5px);user-select:none">' + esc(secret) + '</code>'
        + '<button type="button" onclick="toggleMakKey(' + id + ')" class="w-8 h-8 shrink-0 rounded-lg text-slate-500 hover:text-emerald-600" title="Show / hide key"><i id="mak-eye-' + id + '" class="bi bi-eye"></i></button>'
        + '<button type="button" onclick="copyMakKey(' + id + ')" class="w-8 h-8 shrink-0 rounded-lg text-slate-500 hover:text-emerald-600" title="Copy key"><i class="bi bi-clipboard"></i></button>'
        + '</div>'
      : '<div class="clay-card p-2.5 mt-3 rounded-2xl text-[10px] text-slate-400">Raw key is not stored for this older MAK. Rotate it to get a copyable key here.</div>';

    return '<div class="glass-card p-4 md:p-5"><div class="flex flex-wrap items-start justify-between gap-3">'
      + '<div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2 mb-1">' + statusChip(effectiveLicenseStatus(l))
      + '<span class="text-[10px] font-extrabold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600">' + esc(expiryLabel(l)) + '</span></div>'
      + '<p class="text-sm md:text-base font-bold text-slate-800 truncate">' + esc(l.label || l.license_uid) + '</p>'
      + '<p class="text-[10px] font-mono text-slate-400 mt-0.5 break-all">' + esc(l.license_uid) + (l.user_ref ? ' · ' + esc(l.user_ref) : '') + '</p>'
      + '<div class="mt-2">' + hostLine + '</div></div>'
      + '<button type="button" onclick="openMakDetails(' + id + ')" class="btn-premium px-4 py-2 rounded-xl text-xs font-bold">Details</button></div>'
      + secretBox
      + '<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">'
      + '<div class="clay-card p-2 text-center rounded-xl"><p class="text-[10px] text-slate-400 font-bold">PACKAGES</p><p class="text-xs font-black">' + pkgCount + ' / ' + maxPackages + '</p></div>'
      + '<div class="clay-card p-2 text-center rounded-xl"><p class="text-[10px] text-slate-400 font-bold">APP NAMES</p><p class="text-xs font-black">' + maxHostApps + ' / ' + hostAppLimit + '</p></div>'
      + '<div class="clay-card p-2 text-center rounded-xl" title="' + (guestLimit ? 'Distinct cloned apps (package + app name) bound under each host app, compared with the configured limit' : 'Cloned apps are unlimited; the signed package + app name + certificate identity is still enforced') + '"><p class="text-[10px] text-slate-400 font-bold">CLONED APPS</p><p class="text-xs font-black">' + (guestLimit ? clonedApps + ' / ' + guestLimit : 'UNLIMITED') + '</p></div>'
      + '<div class="clay-card p-2 text-center rounded-xl"><p class="text-[10px] text-slate-400 font-bold">ACTIVATIONS</p><p class="text-xs font-black">' + Number(l.activation_count || 0) + ' / ' + Number(l.max_activations || 0) + '</p></div></div>'
      + details + '</div>';
  }).join('') : '<div class="glass-card p-10 text-center"><i class="bi bi-inbox text-5xl text-slate-300 mb-3"></i><p class="text-slate-500 text-sm">No MAK licenses found</p><a href="/sdk/generate" class="inline-block mt-3 btn-premium px-6 py-2.5 rounded-xl text-xs font-bold">Generate MAK</a></div>';

  return '<div class="pagehead"><div class="ph-ic"><i class="bi bi-view-list"></i></div><div class="flex-1 min-w-0"><h1 class="truncate">MAK Keys</h1><p class="truncate">Tap Details to extend limits, block a package or delete a MAK</p></div></div>'
    + '<div class="glass-card p-4 mb-4"><form method="GET" action="/sdk/keys" class="flex flex-wrap gap-2 items-center">'
    + '<input type="hidden" name="status" value="' + esc(status) + '">'
    + '<div class="clay-card px-3 py-2 flex items-center gap-2 flex-1 rounded-xl" style="min-width:220px"><i class="bi bi-search text-slate-400"></i><input name="q" value="' + esc(q) + '" placeholder="Search license ID, label, user or host package" class="bg-transparent text-sm flex-1 outline-none"></div>'
    + '<button class="btn-premium px-4 py-2 rounded-xl text-xs font-bold">Search</button></form></div>'
    + filterHtml
    + '<div class="space-y-3">' + rows + '</div>'
    + '<p class="text-[11px] text-slate-400 mt-4"><i class="bi bi-info-circle"></i> Raw MAK values are stored in D1 so the owner can reveal them here. Keep panel access restricted.</p>'
    + '<script>'
    + 'function toggleMakKey(id){var el=document.getElementById("mak-key-"+id);var eye=document.getElementById("mak-eye-"+id);if(!el)return;var hidden=el.getAttribute("data-hidden")==="1";el.style.filter=hidden?"none":"blur(5px)";el.style.userSelect=hidden?"text":"none";el.setAttribute("data-hidden",hidden?"0":"1");if(eye)eye.className=hidden?"bi bi-eye-slash":"bi bi-eye";}'
    + 'function copyMakKey(id){var el=document.getElementById("mak-key-"+id);if(!el)return;var text=el.textContent.trim();var done=function(){var old=el.style.filter;el.style.filter="none";setTimeout(function(){if(el.getAttribute("data-hidden")==="1")el.style.filter=old||"blur(5px)";},900);};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done,function(){fallbackMakCopy(text);done();});}else{fallbackMakCopy(text);done();}}'
    + 'function fallbackMakCopy(text){var t=document.createElement("textarea");t.value=text;t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.select();try{document.execCommand("copy");}catch(e){}document.body.removeChild(t);}'
    + 'function openMakDetails(id){var d=document.getElementById("mak-details-"+id);if(!d)return;d.open=true;d.scrollIntoView({behavior:"smooth",block:"start"});}'
    + '</script>';
}
