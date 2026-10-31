import { esc } from '../ui.js';
import { pageHead, alertBox } from '../panel-ui.js';

function stat(label, value, tone) {
  return '<div class="glass-card p-4 relative overflow-hidden"><div class="absolute top-0 left-0 right-0 h-1 avatar-premium"></div>'
    + '<p class="text-[10px] font-extrabold uppercase tracking-widest" style="color:var(--muted)">' + esc(label) + '</p>'
    + '<p class="text-2xl font-black mt-1 ' + (tone || '') + '">' + esc(String(value)) + '</p></div>';
}

function statusChip(status) {
  const label = status === 'active' ? 'Active' : status === 'pending' ? 'Pending' : status === 'expired' ? 'Expired' : 'Disabled';
  const cls = status === 'active' ? 'chip-g' : status === 'pending' ? 'chip-a' : 'chip-r';
  return '<span class="chip ' + cls + '">' + label + '</span>';
}

function fmtTime(value) {
  return value ? esc(String(value)) + ' <span class="text-[9px] font-bold" style="color:var(--muted)">UTC</span>' : '<span style="color:var(--muted)">—</span>';
}

export function opencodePage(data, o) {
  const msg = o.ok ? alertBox('ok', 'Done', esc(o.ok)) : o.error ? alertBox('err', 'Error', esc(o.error)) : '';
  const s = data.settings || {};
  const stats = data.stats || {};
  const users = data.users || [];
  const notices = data.notices || [];
  const globalOn = String(s.global_enabled || '1') === '1';

  const userRows = users.map((u) => {
    const st = u.computed_status || u.status || 'pending';
    return '<tr>'
      + '<td><div class="min-w-0"><p class="font-bold text-[13px] truncate">' + esc(u.email) + '</p>'
      + '<p class="text-[10px] font-bold truncate" style="color:var(--muted)">#' + u.id + ' · ' + esc(u.display_name || 'No name') + '</p></div></td>'
      + '<td>' + statusChip(st) + '</td>'
      + '<td class="text-[11px] font-bold">' + fmtTime(u.expires_at) + '</td>'
      + '<td class="text-[10px] font-mono break-all max-w-[180px]">' + esc(u.device_name || u.device_id || '—') + '</td>'
      + '<td class="text-[10px] font-bold" style="color:var(--muted)">' + fmtTime(u.last_seen) + '</td>'
      + '<td><form method="POST" class="flex flex-wrap gap-1.5 items-center">'
      + '<input type="hidden" name="user_id" value="' + u.id + '">'
      + '<input type="number" name="days" value="30" min="1" max="3650" class="clay-card px-2 py-1.5 text-xs rounded-lg" style="width:68px;" aria-label="Days">'
      + '<button name="action" value="activate_user" class="mini-btn" title="Activate"><i class="bi bi-check2-circle"></i></button>'
      + '<button name="action" value="extend_user" class="mini-btn" title="Extend from current expiry"><i class="bi bi-plus-lg"></i></button>'
      + '<button name="action" value="reset_device" onclick="return confirm(\'Reset device binding for this user?\')" class="mini-btn" title="Reset device"><i class="bi bi-phone"></i></button>'
      + '<button name="action" value="revoke_sessions" onclick="return confirm(\'Revoke all sessions?\')" class="mini-btn" title="Revoke sessions"><i class="bi bi-box-arrow-right"></i></button>'
      + '<button name="action" value="disable_user" onclick="return confirm(\'Disable this user?\')" class="mini-btn danger" title="Disable"><i class="bi bi-slash-circle"></i></button>'
      + '<button name="action" value="delete_user" onclick="return confirm(\'Delete this user permanently?\')" class="mini-btn danger" title="Delete"><i class="bi bi-trash"></i></button>'
      + '</form></td></tr>';
  }).join('');

  const noticeRows = notices.map((n) => '<div class="clay-card rounded-2xl p-3.5"><div class="flex items-start gap-2.5">'
    + '<div class="flex-1 min-w-0"><p class="font-bold text-[13px]">' + esc(n.title) + (n.is_active ? '' : ' <span class="chip chip-r">Off</span>') + '</p>'
    + '<p class="text-[11px] mt-1 whitespace-pre-wrap" style="color:var(--muted)">' + esc(n.message) + '</p>'
    + '<p class="text-[9px] font-bold mt-1.5" style="color:var(--muted)">#' + n.id + ' · ' + fmtTime(n.created_at) + '</p></div>'
    + '<form method="POST" class="flex gap-1 shrink-0"><input type="hidden" name="notice_id" value="' + n.id + '">'
    + '<button name="action" value="toggle_notice" class="mini-btn" title="Toggle"><i class="bi bi-power"></i></button>'
    + '<button name="action" value="delete_notice" onclick="return confirm(\'Delete notice?\')" class="mini-btn danger" title="Delete"><i class="bi bi-trash"></i></button>'
    + '</form></div></div>').join('');

  return pageHead('OpenCode App', 'bi-phone', 'Login, activation, remote switch and notices for the Android app. Owner-only control room.')
    + msg
    + '<div class="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-4">'
    + stat('Registered', stats.total || 0) + stat('Active', stats.active || 0, 'text-emerald-600') + stat('Pending', stats.pending || 0, 'text-amber-600')
    + stat('Disabled', stats.disabled || 0, 'text-red-500') + stat('Seen 24h', stats.online || 0, 'text-blue-600') + '</div>'

    + '<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">'
    + '<form method="POST" class="glass-card p-5 relative overflow-hidden"><div class="absolute top-0 left-0 right-0 h-1 avatar-premium"></div>'
    + '<h3 class="font-black mb-1"><i class="bi bi-power mr-1"></i>Remote Control</h3>'
    + '<p class="text-[11px] font-bold mb-3" style="color:var(--muted)">Global switch sabhi OpenCode app users ko lock/unlock karta hai. User-level activation neeche hai.</p>'
    + '<label class="flex items-center justify-between gap-3 clay-card rounded-xl px-3.5 py-3 mb-3"><span class="text-xs font-extrabold">OpenCode enabled</span>'
    + '<input type="checkbox" name="global_enabled" value="1"' + (globalOn ? ' checked' : '') + ' class="w-5 h-5 accent-emerald-500"></label>'
    + '<label class="block text-[10px] font-extrabold uppercase mb-1" style="color:var(--muted)">Maintenance / disabled message</label>'
    + '<textarea name="maintenance_message" rows="2" maxlength="500" class="w-full clay-card px-3 py-2.5 text-xs rounded-xl mb-3" placeholder="App is temporarily paused by the admin.">' + esc(s.maintenance_message || '') + '</textarea>'
    + '<div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">'
    + '<div><label class="block text-[10px] font-extrabold uppercase mb-1" style="color:var(--muted)">Support URL</label><input name="support_url" value="' + esc(s.support_url || '') + '" class="w-full clay-card px-3 py-2.5 text-xs rounded-xl" placeholder="https://t.me/..."></div>'
    + '<div><label class="block text-[10px] font-extrabold uppercase mb-1" style="color:var(--muted)">Min app version code</label><input type="number" name="min_version_code" min="1" value="' + esc(s.min_version_code || '1') + '" class="w-full clay-card px-3 py-2.5 text-xs rounded-xl"></div></div>'
    + '<button name="action" value="save_settings" class="btn-premium w-full py-3 rounded-xl text-xs font-extrabold">Save remote settings</button></form>'

    + '<form method="POST" class="glass-card p-5 relative overflow-hidden"><div class="absolute top-0 left-0 right-0 h-1 avatar-premium"></div>'
    + '<h3 class="font-black mb-1"><i class="bi bi-megaphone mr-1"></i>Push Notice</h3>'
    + '<p class="text-[11px] font-bold mb-3" style="color:var(--muted)">Latest active notice app ke lock screen / chat banner me dikhta hai.</p>'
    + '<input name="title" maxlength="120" placeholder="Notice title" class="w-full clay-card px-3 py-2.5 text-xs rounded-xl mb-2">'
    + '<textarea name="message" rows="3" maxlength="1200" placeholder="Activation update, maintenance, new version…" class="w-full clay-card px-3 py-2.5 text-xs rounded-xl mb-2"></textarea>'
    + '<button name="action" value="add_notice" class="btn-premium w-full py-3 rounded-xl text-xs font-extrabold"><i class="bi bi-send"></i> Publish notice</button></form></div>'

    + '<div class="glass-card p-5 mb-4"><div class="flex flex-wrap items-center gap-2 mb-3"><h3 class="font-black"><i class="bi bi-people-fill mr-1"></i>App Accounts</h3>'
    + '<form method="GET" class="ml-auto flex gap-1.5"><input name="q" value="' + esc(o.q || '') + '" placeholder="Search Gmail…" class="clay-card px-3 py-2 text-xs rounded-xl"><button class="mini-btn"><i class="bi bi-search"></i></button></form></div>'
    + '<p class="text-[11px] font-bold mb-3" style="color:var(--muted)">Only @gmail.com accounts can register. Device binding ek account ko ek device par lock karta hai.</p>'
    + '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th>Status</th><th>Expiry</th><th>Device</th><th>Last seen</th><th>Actions</th></tr></thead><tbody>'
    + (userRows || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:28px;">No OpenCode accounts yet</td></tr>')
    + '</tbody></table></div></div>'

    + '<div class="glass-card p-5"><h3 class="font-black mb-3"><i class="bi bi-bell-fill mr-1"></i>Notice History</h3><div class="space-y-2">'
    + (noticeRows || '<div class="clay-card p-4 text-center text-xs font-bold rounded-2xl" style="color:var(--muted)">No notices yet</div>')
    + '</div></div>';
}
