import { esc } from '../ui.js';

function statusPill(label, value, tone) {
  return '<div class="glass-card p-4"><p class="text-[10px] font-extrabold text-slate-400 uppercase">' + esc(label) + '</p><p class="text-lg font-black ' + tone + '">' + esc(value) + '</p></div>';
}

export function serverPage(o) {
  const settings = o.settings || {};
  const signing = o.signing || {};
  const stats = o.stats || {};
  const enabled = !!o.enabled;
  const ok = o.ok ? '<div class="glass-card p-4 mb-4" style="border-left:4px solid #10b981"><p class="text-xs font-bold text-emerald-700"><i class="bi bi-check-circle-fill mr-1"></i> Server settings saved.</p></div>' : '';
  const warning = !signing.ok ? '<div class="glass-card p-4 mb-4" style="border-left:4px solid #ef4444"><p class="text-xs font-bold text-red-700"><i class="bi bi-shield-exclamation mr-1"></i> Signing disabled: ' + esc(signing.reason || 'MAK_SIGNING_KEY is not configured.') + '</p><p class="text-[11px] text-slate-600 mt-1">Set the Worker secret, then redeploy. Status: <code>GET /mak/v1/status</code>.</p></div>' : '';

  const endpoints = [
    ['POST', '/mak/v1/challenge', 'Start a silent host activation challenge'],
    ['POST', '/mak/v1/authorize', 'Verify MAK + device proof, return a signed session'],
    ['POST', '/mak/v1/guest/check', 'Signed install / launch / update / restart decision'],
    ['POST', '/mak/v1/renew', 'Renew a signed session'],
    ['POST', '/mak/v1/heartbeat', 'Keep a session and device liveness fresh'],
    ['POST', '/mak/v1/events', 'Report guest and host runtime events'],
    ['GET', '/mak/v1/status', 'Public service status and signing identity'],
    ['POST', '/mak/v1/revoke', 'Admin-only immediate revocation'],
  ];
  const endpointRows = endpoints.map(([method, path, desc]) =>
    '<div class="clay-card p-3 rounded-2xl flex flex-wrap items-center gap-2"><span class="text-[10px] font-extrabold px-2 py-1 rounded-lg ' + (method === 'GET' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600') + '">' + method + '</span><code class="text-xs font-mono font-bold text-slate-700 flex-1 break-all">' + esc(path) + '</code><span class="text-[10px] text-slate-400">' + esc(desc) + '</span></div>'
  ).join('');

  return ok + warning
    + '<div class="pagehead"><div class="ph-ic"><i class="bi bi-hdd-network-fill"></i></div><div class="flex-1 min-w-0"><h1 class="truncate">Server & API</h1><p class="truncate">MAK/1 activation service status and endpoints</p></div></div>'
    + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">'
    + statusPill('Activation server', enabled ? 'ONLINE' : 'OFFLINE', enabled ? 'text-emerald-600' : 'text-red-600')
    + statusPill('Signing', signing.ok ? 'Ed25519 ready' : 'Missing key', signing.ok ? 'text-emerald-600' : 'text-amber-600')
    + statusPill('Heartbeat', String(settings.heartbeat_interval || 300) + 's', 'text-slate-800')
    + statusPill('Session TTL', String(settings.session_ttl || 3600) + 's', 'text-slate-800')
    + '</div>'
    + '<div class="grid lg:grid-cols-2 gap-4 mb-6">'
    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-3"><i class="bi bi-toggles text-purple-500"></i> Kill switch</h3>'
    + '<form method="POST" action="/sdk/server" class="space-y-3"><input type="hidden" name="_csrf" value="' + esc(o.csrf || '') + '"><input type="hidden" name="action" value="save">'
    + '<label class="clay-card p-4 rounded-2xl flex items-center gap-3 cursor-pointer"><input type="checkbox" name="server_enabled" value="1" ' + (enabled ? 'checked' : '') + ' class="w-6 h-6" style="accent-color:#10b981"><span class="text-sm font-black flex-1">Activation decisions enabled</span><span class="text-[10px] font-extrabold ' + (enabled ? 'text-emerald-600' : 'text-red-600') + '">' + (enabled ? 'ON' : 'OFF') + '</span></label>'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase mb-2">Maintenance message</label><input name="maintenance_message" value="' + esc(settings.maintenance_message || '') + '" maxlength="300" class="w-full clay-card px-4 py-3 text-sm rounded-2xl"></div>'
    + '<p class="text-[11px] text-slate-500">OFF immediately denies authorize, guest checks, renew and heartbeat. The panel stays available.</p>'
    + '<button class="btn-premium w-full py-3 rounded-xl text-xs font-bold uppercase">Save server status</button></form></div>'
    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-3"><i class="bi bi-shield-lock-fill text-emerald-500"></i> Signing identity</h3>'
    + '<div class="space-y-2 text-xs text-slate-600"><p><b>Algorithm:</b> Ed25519 response signatures</p><p><b>Key ID:</b> ' + esc(signing.keyId || 'not configured') + '</p><p><b>Device proof:</b> ECDSA P-256</p><p><b>Licenses:</b> ' + Number(stats.total || 0) + ' total · ' + Number(stats.active || 0) + ' active</p></div>'
    + '<div class="mt-3"><label class="text-[10px] font-extrabold text-slate-500 uppercase">Status endpoint</label><div class="clay-card p-3 flex gap-2 rounded-2xl mt-1"><code id="status-url" class="flex-1 text-xs font-mono font-bold break-all">https://' + esc(o.host || '') + '/mak/v1/status</code><button type="button" onclick="copyUrl(\'status-url\',this)" class="clay-card w-9 h-9 rounded-xl text-slate-600"><i class="bi bi-clipboard"></i></button></div></div>'
    + '<a href="/mak/settings" class="inline-block mt-3 text-xs font-bold text-purple-600 hover:underline">Advanced protocol settings →</a></div></div>'
    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-3"><i class="bi bi-terminal text-blue-500"></i> MAK/1 endpoints</h3><div class="space-y-2">' + endpointRows + '</div>'
    + '<p class="text-[11px] text-slate-400 mt-3">Host + guest traffic is cross-origin JSON. The server never returns a shared secret; every decision is signed with the active Ed25519 key.</p></div>';
}

export function hashPage(o) {
  const hashes = o.hashes || [];
  const active = hashes.find((h) => h.is_active) || null;
  const ok = o.ok ? '<div class="glass-card p-4 mb-4" style="border-left:4px solid #10b981"><p class="text-xs font-bold text-emerald-700"><i class="bi bi-check-circle-fill mr-1"></i> ' + esc(o.ok) + '</p></div>' : '';
  const err = o.error ? '<div class="glass-card p-4 mb-4" style="border-left:4px solid #ef4444"><p class="text-xs font-bold text-red-700"><i class="bi bi-exclamation-circle-fill mr-1"></i> ' + esc(o.error) + '</p></div>' : '';

  const list = hashes.length ? hashes.map((h) =>
    '<div class="clay-card p-3 flex flex-wrap items-center gap-3 rounded-2xl">'
    + '<span class="text-[10px] font-extrabold px-2 py-1 rounded-lg ' + (h.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500') + '">' + (h.is_active ? 'ACTIVE' : 'OFF') + '</span>'
    + '<div class="flex-1 min-w-0"><p class="text-xs font-bold">' + esc(h.hash_label) + ' <span class="text-[9px] uppercase text-slate-400">' + esc(h.engine || 'GENERAL') + '</span></p><p class="text-[10px] font-mono text-slate-500 break-all">' + esc(h.hash_value) + '</p></div>'
    + '<form method="POST" action="/sdk/hash"><input type="hidden" name="_csrf" value="' + esc(o.csrf || '') + '"><input type="hidden" name="action" value="toggle_hash"><input type="hidden" name="hash_id" value="' + Number(h.id) + '"><button class="w-8 h-8 ' + (h.is_active ? 'text-emerald-600' : 'text-slate-400') + '" title="Toggle"><i class="bi ' + (h.is_active ? 'bi-toggle-on' : 'bi-toggle-off') + '"></i></button></form>'
    + '<form method="POST" action="/sdk/hash" onsubmit="return confirm(\'Delete this hash?\')"><input type="hidden" name="_csrf" value="' + esc(o.csrf || '') + '"><input type="hidden" name="action" value="delete_hash"><input type="hidden" name="hash_id" value="' + Number(h.id) + '"><button class="w-8 h-8 text-red-500" title="Delete"><i class="bi bi-trash text-xs"></i></button></form></div>'
  ).join('') : '<div class="text-center py-8 text-slate-400 text-xs">No hashes added yet</div>';

  return ok + err
    + '<div class="pagehead"><div class="ph-ic"><i class="bi bi-fingerprint"></i></div><div class="flex-1 min-w-0"><h1 class="truncate">Hash Vault</h1><p class="truncate">Universal lib signature verification (.so SHA-256)</p></div></div>'
    + '<div class="glass-card p-5 mb-6"><h3 class="font-black">Universal Lib Hash</h3><p class="text-[11px] text-slate-500">One hash for all users — app/package independent.</p>'
    + '<div class="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-[11px] text-amber-700 mt-3">Run <code>sha256sum lib.so</code> in Termux and paste the 64-hex output.</div>'
    + '<div class="mt-3"><label class="text-[10px] font-extrabold text-slate-500 uppercase">Client Salt</label><div class="clay-card p-3 flex gap-2 rounded-2xl mt-1"><code id="salt-v" class="flex-1 text-xs font-mono font-bold break-all">' + esc(o.salt || '') + '</code><button type="button" onclick="copyUrl(\'salt-v\',this)" class="clay-card w-9 h-9 rounded-xl text-slate-600"><i class="bi bi-clipboard"></i></button></div></div>'
    + '<div class="mt-3"><label class="text-[10px] font-extrabold text-slate-500 uppercase">Realtime AES-128 Key (hex)</label><div class="clay-card p-3 flex gap-2 rounded-2xl mt-1"><code id="aes-v" class="flex-1 text-xs font-mono font-bold break-all blur-sm select-none">' + esc(o.aesHex || '') + '</code><button onclick="document.getElementById(\'aes-v\').classList.toggle(\'blur-sm\')" class="clay-card w-9 h-9 rounded-xl"><i class="bi bi-eye"></i></button></div></div></div>'
    + '<div class="grid lg:grid-cols-2 gap-4">'
    + '<div class="glass-card p-5"><h3 class="font-bold mb-4"><i class="bi bi-plus-circle"></i> Add lib hash</h3><form method="POST" action="/sdk/hash" class="space-y-3"><input type="hidden" name="_csrf" value="' + esc(o.csrf || '') + '"><input type="hidden" name="action" value="add_hash">'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase mb-2">Label</label><input name="hash_label" placeholder="e.g. lib.so" required maxlength="100" class="w-full clay-card px-4 py-3 text-sm rounded-2xl"></div>'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase mb-2">SHA-256</label><input name="hash_value" placeholder="64 hex characters" required pattern="[a-fA-F0-9]{64}" class="w-full clay-card px-4 py-3 text-sm font-mono rounded-2xl"></div>'
    + '<button class="btn-premium w-full py-3 rounded-xl text-xs font-bold">Add hash</button></form></div>'
    + '<div class="glass-card p-5"><h3 class="font-bold mb-4">Hashes (' + hashes.length + ')</h3>' + (active ? '<div class="glass-card p-3 mb-3" style="border-left:4px solid #10b981"><p class="text-[10px] font-extrabold text-emerald-600">ACTIVE HASH</p><p class="text-xs font-bold">' + esc(active.hash_label) + '</p><code class="text-[10px] font-mono break-all">' + esc(active.hash_value) + '</code></div>' : '<div class="glass-card p-4 mb-3" style="border-left:4px solid #f59e0b"><p class="text-xs font-bold text-amber-700">No active hash configured</p></div>') + list + '</div></div>';
}
