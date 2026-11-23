import { esc } from '../ui.js';

function kpi(label, value, icon, extra) {
  return '<div class="glass-card p-5"><div class="flex items-start justify-between gap-3">'
    + '<div class="min-w-0"><p class="kpi-label">' + esc(label) + '</p>'
    + '<p class="kpi-val truncate">' + esc(value) + '</p>'
    + (extra ? '<p class="kpi-foot">' + esc(extra) + '</p>' : '') + '</div>'
    + '<div class="stat-ic"><i class="bi ' + esc(icon) + '"></i></div></div></div>';
}

function roleChip(role) {
  const value = String(role || '').toUpperCase();
  const cls = value === 'PROFESSOR' || value === 'OWNER'
    ? 'chip-i'
    : value === 'ADMIN' ? 'chip-a' : 'chip-n';
  return '<span class="chip ' + cls + '">' + esc(value) + '</span>';
}

function roleColor(role) {
  const value = String(role || '').toUpperCase();
  if (value === 'PROFESSOR') return '#7C3AED';
  if (value === 'OWNER') return '#4F46E5';
  if (value === 'ADMIN') return '#F59E0B';
  if (value === 'RESELLER') return '#10B981';
  return '#94A3B8';
}

function panelRow(p) {
  const active = (p.is_active | 0) === 1;
  const auto = (p.auto_join | 0) === 1;
  const limit = p.account_limit | 0;
  const used = p.total_users | 0;
  const left = limit === 0 ? '∞' : String(Math.max(0, limit - used));
  const expiry = p.expires_at_ist || p.expires_at || '—';
  return '<tr data-search="' + esc(String(p.panel_code || '').toLowerCase()) + '">'
    + '<td><div class="flex items-center gap-2.5"><div class="w-9 h-9 rounded-lg avatar-premium text-white flex items-center justify-center font-black text-sm shrink-0">'
    + esc(String(p.panel_code || '?').substring(0, 1).toUpperCase()) + '</div>'
    + '<div class="min-w-0"><p class="font-bold text-[13px] truncate mono">' + esc(p.panel_code) + '</p>'
    + '<p class="text-[11px] truncate" style="color:var(--muted)">' + (active ? 'Active' : 'Off') + ' · ' + esc(expiry) + '</p></div></div></td>'
    + '<td><span class="chip ' + (active ? 'chip-g' : 'chip-r') + '">' + (active ? 'Active' : 'Off') + '</span>'
    + (auto ? ' <span class="chip chip-i" title="Join page default"><i class="bi bi-star-fill"></i></span>' : '') + '</td>'
    + '<td class="mono">' + used + ' / ' + (limit === 0 ? '∞' : limit) + '</td>'
    + '<td class="mono">' + (p.total_keys | 0) + '</td>'
    + '<td class="mono">' + left + '</td></tr>';
}

function userRow(u) {
  const blocked = (u.is_blocked | 0) === 1;
  return '<div class="clay-card p-3 rounded-2xl flex items-center gap-2.5">'
    + '<div class="w-9 h-9 rounded-lg avatar-premium text-white flex items-center justify-center font-black text-sm shrink-0">'
    + esc(String(u.username || '?').substring(0, 1).toUpperCase()) + '</div>'
    + '<div class="flex-1 min-w-0"><p class="font-bold text-[13px] truncate">' + esc(u.username) + '</p>'
    + '<p class="text-[11px] truncate" style="color:var(--muted)">' + esc(u.panel_code) + ' · ' + esc(u.last_login_ist || 'never') + '</p></div>'
    + roleChip(u.role)
    + (blocked ? '<span class="chip chip-r">Blocked</span>' : '<span class="chip chip-g">Active</span>')
    + '</div>';
}

function keyRow(k) {
  const blocked = (k.is_blocked | 0) === 1;
  return '<div class="clay-card p-3 rounded-2xl"><div class="flex items-center gap-2">'
    + '<code class="flex-1 min-w-0 font-mono text-xs font-bold break-all">' + esc(k.key_value) + '</code>'
    + '<span class="chip ' + (blocked ? 'chip-r' : 'chip-g') + ' shrink-0">' + (blocked ? 'Blocked' : 'Active') + '</span></div>'
    + '<div class="flex flex-wrap gap-1.5 mt-2">'
    + '<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600">' + esc(k.panel_code) + '</span>'
    + '<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-purple-50 text-purple-600">' + esc(k.duration) + '</span>'
    + '<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">by ' + esc(k.creator || 'system') + '</span>'
    + '<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-600">' + esc(k.expires_at_ist || 'pending') + '</span>'
    + '</div></div>';
}

export function professorDashboard(sess, data) {
  const t = data.totals || {};
  const panels = data.panels || [];
  const users = data.recentUsers || [];
  const keys = data.recentKeys || [];
  const roles = data.roleDist || [];
  const maxRole = Math.max(1, ...roles.map((r) => r.count | 0));

  const roleBars = roles.map((r) => {
    const color = roleColor(r.role);
    const pct = Math.max(6, Math.round(((r.count | 0) / maxRole) * 100));
    return '<div class="mb-3"><div class="flex items-center justify-between gap-2 mb-1">'
      + '<span class="text-xs font-extrabold">' + roleChip(r.role) + '</span>'
      + '<span class="text-xs font-black mono">' + (r.count | 0) + '</span></div>'
      + '<div class="h-2 rounded-full" style="background:var(--surface2)">'
      + '<div class="h-2 rounded-full" style="width:' + pct + '%;background:' + color + '"></div></div></div>';
  }).join('');

  const panelRows = panels.map(panelRow).join('');
  const userRows = users.map(userRow).join('');
  const keyRows = keys.map(keyRow).join('');

  const quick = [
    ['New Tenant', '/create-panel', 'bi-server', 'Create, limit, auto-join'],
    ['SDK Panel', '/sdk', 'bi-boxes', 'MAK licenses + devices'],
    ['API Tester', '/api-test', 'bi-broadcast', 'Connect + encrypt live'],
    ['Set Mod/Loader', '/loader-manager', 'bi-box-seam-fill', 'Versions + tags'],
    ['Server & Mod', '/server', 'bi-hdd-fill', 'Maintenance + features'],
    ['Users', '/users', 'bi-people-fill', 'Roles + balance'],
    ['Referrals', '/referral', 'bi-diagram-3-fill', 'Mint owner/admin codes'],
    ['Encryption', '/aes', 'bi-shield-shaded', 'AES keys + activation'],
  ].map((q) => '<a href="' + q[1] + '" class="linkrow"><span class="stat-ic"><i class="bi ' + q[2] + '"></i></span>'
    + '<span>' + q[0] + '<span class="block text-xs font-medium" style="color:var(--muted)">' + q[3] + '</span></span>'
    + '<i class="bi bi-chevron-right chev"></i></a>').join('');

  return '<div class="relative overflow-hidden rounded-2xl p-6 mb-5" style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 55%,#9333EA 100%);color:#fff">'
    + '<div class="absolute -right-16 -top-16 w-64 h-64 rounded-full" style="background:rgba(255,255,255,0.12)"></div>'
    + '<div class="absolute right-10 bottom-0 w-40 h-40 rounded-full" style="background:rgba(255,255,255,0.08)"></div>'
    + '<div class="relative flex flex-wrap items-center gap-4">'
    + '<div class="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0" style="background:rgba(255,255,255,0.18);backdrop-filter:blur(6px)"><i class="bi bi-mortarboard-fill"></i></div>'
    + '<div class="flex-1 min-w-[220px]"><p class="text-[11px] font-extrabold uppercase tracking-[0.2em] opacity-80">Professor Console</p>'
    + '<h1 class="text-2xl md:text-3xl font-black tracking-tight">Global command, ' + esc(sess.username) + '</h1>'
    + '<p class="text-sm opacity-85 mt-1">Tenants, keys, roles and SDK access — one place. PROFESSOR is the single top role.</p></div>'
    + '<span class="chip" style="background:rgba(255,255,255,0.18);color:#fff;border:1px solid rgba(255,255,255,0.35)"><i class="bi bi-shield-check mr-1"></i>PROFESSOR</span>'
    + '</div></div>'

    + '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">'
    + kpi('Panels', t.panels || 0, 'bi-server', (t.active_panels || 0) + ' active')
    + kpi('Users', t.users || 0, 'bi-people-fill', (t.professors || 0) + ' professor')
    + kpi('Keys', t.keys || 0, 'bi-key-fill', (t.active_keys || 0) + ' active')
    + kpi('Blocked keys', t.blocked_keys || 0, 'bi-shield-lock-fill', 'review queue')
    + '</div>'

    + '<div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">'
    + '<div class="xl:col-span-2 glass-card p-5"><div class="flex items-center justify-between mb-3"><div><h3 class="font-black">Tenant network</h3><p class="text-[11px]" style="color:var(--muted)">' + panels.length + ' panels · users / keys / account headroom</p></div>'
    + '<a href="/create-panel" class="btn-premium px-4 py-2 rounded-xl text-xs font-extrabold shrink-0"><i class="bi bi-plus-lg"></i> New tenant</a></div>'
    + '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Panel</th><th>Status</th><th>Users</th><th>Keys</th><th>Left</th></tr></thead><tbody>'
    + (panelRows || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:28px;">No panels</td></tr>')
    + '</tbody></table></div></div>'

    + '<div class="space-y-4"><div class="glass-card p-5"><h3 class="font-black mb-3">Role distribution</h3>'
    + (roleBars || '<p class="text-sm" style="color:var(--muted)">No users</p>')
    + '<div class="grid grid-cols-2 gap-2 mt-4 pt-4" style="border-top:1px solid var(--line)">'
    + '<div class="clay-card p-3 rounded-xl text-center"><p class="text-xl font-black">' + (t.admins || 0) + '</p><p class="text-[10px] font-bold uppercase" style="color:var(--muted)">Admins</p></div>'
    + '<div class="clay-card p-3 rounded-xl text-center"><p class="text-xl font-black">' + (t.resellers || 0) + '</p><p class="text-[10px] font-bold uppercase" style="color:var(--muted)">Resellers</p></div>'
    + '</div></div>'

    + '<div class="glass-card p-5"><h3 class="font-black mb-3">Security posture</h3><div class="space-y-3 text-[13px]" style="color:var(--muted)">'
    + '<p class="flex items-center justify-between gap-2">Tenant isolation <span class="chip chip-g"><span class="status-dot"></span> On</span></p>'
    + '<p class="flex items-center justify-between gap-2">Device lock <span class="chip chip-g"><span class="status-dot"></span> Enforced</span></p>'
    + '<p class="flex items-center justify-between gap-2">Professor global access <span class="chip chip-i"><i class="bi bi-mortarboard-fill"></i> Active</span></p>'
    + '<p class="flex items-center justify-between gap-2">API transport <span class="chip chip-g"><i class="bi bi-lock-fill"></i> Encrypted</span></p>'
    + '</div></div></div>'

    + '<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">'
    + '<div class="glass-card p-5"><div class="flex items-center justify-between mb-3"><div><h3 class="font-black">Recent users</h3><p class="text-[11px]" style="color:var(--muted)">Latest 8 accounts</p></div><a href="/users" class="mini-btn shrink-0">All users</a></div>'
    + '<div class="space-y-2">' + (userRows || '<div class="glass-card p-6 text-center text-sm" style="color:var(--muted)">No users</div>') + '</div></div>'
    + '<div class="glass-card p-5"><div class="flex items-center justify-between mb-3"><div><h3 class="font-black">Recent keys</h3><p class="text-[11px]" style="color:var(--muted)">Latest 8 generated keys</p></div><a href="/keys" class="mini-btn shrink-0">Key manager</a></div>'
    + '<div class="space-y-2">' + (keyRows || '<div class="glass-card p-6 text-center text-sm" style="color:var(--muted)">No keys</div>') + '</div></div>'
    + '</div>'

    + '<div class="glass-card p-5"><div class="flex items-center justify-between mb-3"><div><h3 class="font-black">Quick actions</h3><p class="text-[11px]" style="color:var(--muted)">Professor shortcuts</p></div><span class="chip chip-i"><i class="bi bi-mortarboard-fill"></i> ' + esc(sess.panel_code || '') + '</span></div>'
    + '<div class="grid grid-cols-1 md:grid-cols-2 gap-2">' + quick + '</div></div>';
}
