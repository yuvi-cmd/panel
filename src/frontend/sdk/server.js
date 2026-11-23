import { esc } from '../ui.js';

function statusPill(label, value, tone) {
  return '<div class="glass-card p-4"><p class="text-[10px] font-extrabold text-slate-400 uppercase">' + esc(label) + '</p><p class="text-lg font-black ' + tone + '">' + esc(value) + '</p></div>';
}

export function serverPage(o) {
  const settings = o.settings || {};
  const signing = o.signing || {};
  const encryption = o.encryption || {};
  const stats = o.stats || {};
  const enabled = !!o.enabled;
  const ok = o.ok ? '<div class="glass-card p-4 mb-4" style="border-left:4px solid #10b981"><p class="text-xs font-bold text-emerald-700"><i class="bi bi-check-circle-fill mr-1"></i> Server settings saved.</p></div>' : '';
  const keysGenerated = o.keysGenerated
    ? '<div class="glass-card p-4 mb-4" style="border-left:4px solid #10b981"><p class="text-xs font-bold text-emerald-700"><i class="bi bi-key-fill mr-1"></i> New MAK/2 keys generated and activated.</p><p class="text-[11px] text-slate-600 mt-1">Public halves are already live on <code>GET /mak/v2/status</code>. Existing installs pick them up through the signed rotation chain; no AAR rebuild is needed.</p></div>'
    : '';
  const warning = (!signing.ok || !encryption.ok)
    ? '<div class="glass-card p-4 mb-4" style="border-left:4px solid #ef4444"><p class="text-xs font-bold text-red-700"><i class="bi bi-shield-exclamation mr-1"></i> MAK/2 keys are incomplete.</p>'
      + (!signing.ok ? '<p class="text-[11px] text-slate-600 mt-1"><b>Signing:</b> ' + esc(signing.reason || 'No Ed25519 signing key is active.') + '</p>' : '')
      + (!encryption.ok ? '<p class="text-[11px] text-slate-600 mt-1"><b>Envelope:</b> ' + esc(encryption.reason || 'No X25519 envelope key is active.') + '</p>' : '')
      + '<p class="text-[11px] text-slate-600 mt-1">Press <b>Generate MAK/2 keys</b> below. Keys are created here and stored in D1 — no Worker secret and no hardcoded key in the APK. Status: <code>GET /mak/v2/status</code>.</p></div>'
    : '';

  const keySourceLabel = o.keySource === 'PANEL' ? 'Panel database'
    : o.keySource === 'ENV' ? 'Worker secrets (legacy)'
      : o.keySource === 'MIXED' ? 'Mixed (panel + Worker secret)' : 'Not configured';

  const endpoints = [
    ['GET', '/mak/v2/status', 'Public signing + envelope key status'],
    ['POST', '/mak/v2/activate', 'Encrypted MAK + host identity → signed grant'],
    ['POST', '/mak/v2/host/verify', 'Strict-online host gate → HostTicket'],
    ['POST', '/mak/v2/guest/check', 'Signed Launch / Install / Update / Restart ticket'],
    ['POST', '/mak/v2/status', 'Signed grant status / revocation check'],
    ['POST', '/mak/v2/deactivate', 'Revoke the current host grant'],
  ];
  const endpointRows = endpoints.map(([method, path, desc]) =>
    '<div class="clay-card p-3 rounded-2xl flex flex-wrap items-center gap-2"><span class="text-[10px] font-extrabold px-2 py-1 rounded-lg ' + (method === 'GET' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600') + '">' + method + '</span><code class="text-xs font-mono font-bold text-slate-700 flex-1 break-all">' + esc(path) + '</code><span class="text-[10px] text-slate-400">' + esc(desc) + '</span></div>'
  ).join('');

  return ok + warning
    + '<div class="pagehead"><div class="ph-ic"><i class="bi bi-hdd-network-fill"></i></div><div class="flex-1 min-w-0"><h1 class="truncate">Server & API</h1><p class="truncate">MAK/2 activation service status and endpoints</p></div></div>'
    + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">'
    + statusPill('Activation server', enabled ? 'ONLINE' : 'OFFLINE', enabled ? 'text-emerald-600' : 'text-red-600')
    + statusPill('Signing', signing.ok ? 'Ed25519 ready' : 'Missing key', signing.ok ? 'text-emerald-600' : 'text-amber-600')
    + statusPill('Envelope', encryption.ok ? 'X25519 ready' : 'Missing key', encryption.ok ? 'text-emerald-600' : 'text-amber-600')
    + statusPill('Protocol', 'MAK/2', 'text-slate-800')
    + '</div>'
    + '<div class="grid lg:grid-cols-2 gap-4 mb-6">'
    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-3"><i class="bi bi-toggles text-purple-500"></i> Kill switch</h3>'
    + '<form method="POST" action="/sdk/server" class="space-y-3"><input type="hidden" name="_csrf" value="' + esc(o.csrf || '') + '"><input type="hidden" name="action" value="save">'
    + '<label class="clay-card p-4 rounded-2xl flex items-center gap-3 cursor-pointer"><input type="checkbox" name="server_enabled" value="1" ' + (enabled ? 'checked' : '') + ' class="w-6 h-6" style="accent-color:#10b981"><span class="text-sm font-black flex-1">Activation decisions enabled</span><span class="text-[10px] font-extrabold ' + (enabled ? 'text-emerald-600' : 'text-red-600') + '">' + (enabled ? 'ON' : 'OFF') + '</span></label>'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase mb-2">Maintenance message</label><input name="maintenance_message" value="' + esc(settings.maintenance_message || '') + '" maxlength="300" class="w-full clay-card px-4 py-3 text-sm rounded-2xl"></div>'
    + '<p class="text-[11px] text-slate-500">OFF immediately denies activate, host verification and every guest check. The panel stays available.</p>'
    + '<button class="btn-premium w-full py-3 rounded-xl text-xs font-bold uppercase">Save server status</button></form></div>'
    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-3"><i class="bi bi-shield-lock-fill text-emerald-500"></i> Signing identity</h3>'
    + '<div class="space-y-2 text-xs text-slate-600"><p><b>Algorithm:</b> Ed25519 grant + ticket signatures</p><p><b>Signing key ID:</b> ' + esc(signing.keyId || 'not configured') + '</p><p><b>Ed25519 fingerprint:</b> <code>' + esc(signing.fingerprint || '—') + '</code></p><p><b>Envelope key ID:</b> ' + esc(encryption.keyId || 'not configured') + '</p><p><b>X25519 fingerprint:</b> <code>' + esc(encryption.fingerprint || '—') + '</code></p><p><b>Licenses:</b> ' + Number(stats.total || 0) + ' total · ' + Number(stats.active || 0) + ' active</p></div>'
    + '<div class="mt-3"><label class="text-[10px] font-extrabold text-slate-500 uppercase">Status endpoint</label><div class="clay-card p-3 flex gap-2 rounded-2xl mt-1"><code id="status-url" class="flex-1 text-xs font-mono font-bold break-all">https://' + esc(o.host || '') + '/mak/v2/status</code><button type="button" onclick="copyUrl(\'status-url\',this)" class="clay-card w-9 h-9 rounded-xl text-slate-600"><i class="bi bi-clipboard"></i></button></div></div>'
    + '<a href="/sdk/settings" class="inline-block mt-3 text-xs font-bold text-purple-600 hover:underline">Advanced protocol settings →</a></div></div>'
    + '<div class="glass-card p-5 mb-6"><div class="flex flex-wrap items-center gap-3 mb-3"><h3 class="font-bold text-slate-800 flex-1"><i class="bi bi-key-fill text-amber-500"></i> MAK/2 server keys</h3><span class="text-[10px] font-extrabold px-2 py-1 rounded-lg ' + (o.keySource === 'PANEL' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700') + '">' + esc(keySourceLabel) + '</span></div>'
    + '<p class="text-xs text-slate-600 mb-3">The panel generates the Ed25519 signing key and the X25519 envelope key, stores both in D1 and publishes only the public halves at <code>/mak/v2/status</code>. Nothing is hardcoded in the APK and no Worker secret has to be pasted.</p>'
    + '<div class="grid sm:grid-cols-2 gap-3 mb-3">'
    + '<div class="clay-card p-3 rounded-2xl"><p class="text-[10px] font-extrabold text-slate-400 uppercase">Ed25519 signing</p><p class="text-xs font-mono font-bold break-all">' + esc(signing.keyId || '—') + '</p><p class="text-[10px] font-mono text-slate-500 break-all mt-1">' + esc(signing.fingerprint || 'not generated') + '</p></div>'
    + '<div class="clay-card p-3 rounded-2xl"><p class="text-[10px] font-extrabold text-slate-400 uppercase">X25519 envelope</p><p class="text-xs font-mono font-bold break-all">' + esc(encryption.keyId || '—') + '</p><p class="text-[10px] font-mono text-slate-500 break-all mt-1">' + esc(encryption.fingerprint || 'not generated') + '</p></div>'
    + '</div>'
    + '<p class="text-[11px] text-slate-500 mb-3">Signed rotations: <b>' + Number(o.rotations || 0) + '</b>. Rotating both keys keeps existing installs working: the old key signs the new key, and the AAR verifies that chain before trusting it.</p>'
    + '<form method="POST" action="/sdk/server" onsubmit="return confirm(\'Generate new MAK/2 keys and activate them now? Existing installs will rotate automatically through the signed chain.\')"><input type="hidden" name="_csrf" value="' + esc(o.csrf || '') + '"><input type="hidden" name="action" value="generate_keys"><button class="btn-premium w-full sm:w-auto px-6 py-3 rounded-xl text-xs font-bold uppercase"><i class="bi bi-arrow-repeat mr-1"></i> ' + (signing.ok && encryption.ok ? 'Rotate MAK/2 keys' : 'Generate MAK/2 keys') + '</button></form>'
    + '</div>'
    + '<div class="glass-card p-5"><h3 class="font-bold text-slate-800 mb-3"><i class="bi bi-terminal text-blue-500"></i> MAK/2 endpoints</h3><div class="space-y-2">' + endpointRows + '</div>'
    + '<p class="text-[11px] text-slate-400 mt-3">Requests use an encrypted NaCl box envelope inside TLS 1.3. The server never returns a shared secret; every grant and ticket is signed with the active Ed25519 key.</p></div>'
    + '<div class="glass-card p-5 mt-4"><h3 class="font-bold text-slate-800 mb-2"><i class="bi bi-code-slash text-purple-500"></i> C++ / Android host integration</h3>'
    + '<div class="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-[11px] text-amber-800"><b>MAK/1 is removed.</b> Old <code>/sdk/mundo</code> (AES-128-ECB), <code>/sdk/bcore</code> (RC4+Base64) and <code>/mak/v1</code> endpoints are gone. The native host client must use <code>https://' + esc(o.host || '') + '/mak/v2</code>, verify the Ed25519 server key and fail closed.</div>'
    + '<ol class="mt-4 space-y-2 text-xs text-slate-600 pl-5 list-decimal">'
    + '<li><b>Activate:</b> <code>POST /mak/v2/activate</code> with the encrypted envelope containing the MAK and the native host package/cert.</li>'
    + '<li><b>Host verify:</b> <code>POST /mak/v2/host/verify</code> on every process start. No host ticket means no guest ticket.</li>'
    + '<li><b>Guest operation:</b> <code>POST /mak/v2/guest/check</code> before every install, launch, update or restart. The response is a signed ticket bound to the guest package, APK hash and certificate.</li>'
    + '<li><b>Strict online:</b> server down or airplane mode is a DENY. There is no cached offline launch.</li>'
    + '</ol>'
    + '<p class="text-[11px] text-slate-400 mt-3">Deployment + key rotation: <code>docs/MAK-DEPLOY.md</code>. C++ integration guide: <code>docs/CPP-INTEGRATION.md</code>.</p></div>';
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
    + '<div class="glass-card p-5 mb-6"><h3 class="font-black">Universal Lib Hash</h3><p class="text-[11px] text-slate-500">One hash for all users — app/package independent. Add the SHA-256 of the protected native library and the MAK/2 native gate verifies it against this vault.</p>'
    + '<div class="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-[11px] text-amber-700 mt-3">Run <code>sha256sum lib.so</code> in Termux and paste the 64-hex output.</div></div>'
    + '<div class="grid lg:grid-cols-2 gap-4">'
    + '<div class="glass-card p-5"><h3 class="font-bold mb-4"><i class="bi bi-plus-circle"></i> Add lib hash</h3><form method="POST" action="/sdk/hash" class="space-y-3"><input type="hidden" name="_csrf" value="' + esc(o.csrf || '') + '"><input type="hidden" name="action" value="add_hash">'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase mb-2">Label</label><input name="hash_label" placeholder="e.g. lib.so" required maxlength="100" class="w-full clay-card px-4 py-3 text-sm rounded-2xl"></div>'
    + '<div><label class="block text-xs font-extrabold text-slate-500 uppercase mb-2">SHA-256</label><input name="hash_value" placeholder="64 hex characters" required pattern="[a-fA-F0-9]{64}" class="w-full clay-card px-4 py-3 text-sm font-mono rounded-2xl"></div>'
    + '<button class="btn-premium w-full py-3 rounded-xl text-xs font-bold">Add hash</button></form></div>'
    + '<div class="glass-card p-5"><h3 class="font-bold mb-4">Hashes (' + hashes.length + ')</h3>' + (active ? '<div class="glass-card p-3 mb-3" style="border-left:4px solid #10b981"><p class="text-[10px] font-extrabold text-emerald-600">ACTIVE HASH</p><p class="text-xs font-bold">' + esc(active.hash_label) + '</p><code class="text-[10px] font-mono break-all">' + esc(active.hash_value) + '</code></div>' : '<div class="glass-card p-4 mb-3" style="border-left:4px solid #f59e0b"><p class="text-xs font-bold text-amber-700">No active hash configured</p></div>') + list + '</div></div>';
}
