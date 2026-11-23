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

export function keysPage(o) {
  const licenses = o.licenses || [];
  const counts = o.counts || {};
  const q = o.q || '';
  const status = o.status || 'ALL';

  const filters = [['ALL', 'All', counts.total], ['ACTIVE', 'Active', counts.active], ['SUSPENDED', 'Suspended', counts.suspended], ['EXPIRED', 'Expired', counts.expired], ['REVOKED', 'Revoked', counts.revoked]];
  const filterHtml = '<div class="flex flex-wrap gap-2 mb-4">' + filters.map(([value, label, count]) =>
    '<a href="/sdk/keys?status=' + encodeURIComponent(value) + (q ? '&q=' + encodeURIComponent(q) : '') + '" class="clay-card px-3 py-1.5 text-xs font-bold rounded-xl ' + (status === value ? 'text-purple-600' : 'text-slate-500') + '">' + esc(label) + ' <span class="opacity-60">' + Number(count || 0) + '</span></a>'
  ).join('') + '</div>';

  const rows = licenses.length ? licenses.map((l) => {
    const pkgCount = Number(l.package_count || 0);
    const hosts = l.host_package
      ? '<span class="text-[10px] font-mono text-slate-500 break-all">' + esc(l.host_package) + (pkgCount > 1 ? ' +' + (pkgCount - 1) + ' more' : '') + '</span>'
      : '<span class="text-[10px] text-slate-400">' + (String(l.host_bind_mode || 'AUTO') === 'MANUAL' ? 'Manual / unbound' : 'Auto / unbound') + '</span>';
    return '<div class="glass-card p-4 md:p-5"><div class="flex flex-wrap items-start justify-between gap-3">'
      + '<div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2 mb-1">' + statusChip(l.status)
      + '<span class="text-[10px] font-extrabold px-2 py-1 rounded-lg bg-purple-50 text-purple-600">' + esc(fmtDate(l.expires_at)) + '</span></div>'
      + '<p class="text-sm md:text-base font-bold text-slate-800 truncate">' + esc(l.label || l.license_uid) + '</p>'
      + '<p class="text-[10px] font-mono text-slate-400 mt-0.5 break-all">' + esc(l.license_uid) + (l.user_ref ? ' · ' + esc(l.user_ref) : '') + '</p>'
      + '<div class="mt-2">' + hosts + '</div></div>'
      + '<a href="/sdk/keys/' + Number(l.id) + '" class="btn-premium px-4 py-2 rounded-xl text-xs font-bold">Manage</a></div>'
      + '<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">'
      + '<div class="clay-card p-2 text-center rounded-xl"><p class="text-[10px] text-slate-400 font-bold">PACKAGES</p><p class="text-xs font-black">' + pkgCount + ' / ' + Number(l.max_packages || 1) + '</p></div>'
      + '<div class="clay-card p-2 text-center rounded-xl"><p class="text-[10px] text-slate-400 font-bold">APPS</p><p class="text-xs font-black">' + Number(l.guest_count || 0) + ' / ' + (Number(l.max_packages || 1) * Number(l.max_apps || 2)) + '</p></div>'
      + '<div class="clay-card p-2 text-center rounded-xl"><p class="text-[10px] text-slate-400 font-bold">DEVICES</p><p class="text-xs font-black">' + Number(l.device_count || 0) + ' / ' + Number(l.max_devices || 0) + '</p></div>'
      + '<div class="clay-card p-2 text-center rounded-xl"><p class="text-[10px] text-slate-400 font-bold">ACTIVATIONS</p><p class="text-xs font-black">' + Number(l.activation_count || 0) + ' / ' + Number(l.max_activations || 0) + '</p></div></div></div>';
  }).join('') : '<div class="glass-card p-10 text-center"><i class="bi bi-inbox text-5xl text-slate-300 mb-3"></i><p class="text-slate-500 text-sm">No MAK licenses found</p><a href="/sdk/generate" class="inline-block mt-3 btn-premium px-6 py-2.5 rounded-xl text-xs font-bold">Generate MAK</a></div>';

  return '<div class="pagehead"><div class="ph-ic"><i class="bi bi-view-list"></i></div><div class="flex-1 min-w-0"><h1 class="truncate">MAK Keys</h1><p class="truncate">Issued credentials, bindings and device limits</p></div></div>'
    + '<div class="glass-card p-4 mb-4"><form method="GET" action="/sdk/keys" class="flex flex-wrap gap-2 items-center">'
    + '<input type="hidden" name="status" value="' + esc(status) + '">'
    + '<div class="clay-card px-3 py-2 flex items-center gap-2 flex-1 rounded-xl" style="min-width:220px"><i class="bi bi-search text-slate-400"></i><input name="q" value="' + esc(q) + '" placeholder="Search license ID, label, user or host package" class="bg-transparent text-sm flex-1 outline-none"></div>'
    + '<button class="btn-premium px-4 py-2 rounded-xl text-xs font-bold">Search</button></form></div>'
    + filterHtml
    + '<div class="space-y-3">' + rows + '</div>'
    + '<p class="text-[11px] text-slate-400 mt-4"><i class="bi bi-info-circle"></i> Raw MAK values are never stored. Open a key to rotate a credential if a customer loses it.</p>';
}
