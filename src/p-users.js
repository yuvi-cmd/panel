import { esc } from './ui.js';
import { pageHead, alertBox } from './panel-ui.js';

function hero(icon, title, sub, extra) {
  return '<div class="pagehead"><div class="ph-ic"><i class="bi ' + icon + '"></i></div>'
    + '<div class="flex-1 min-w-0"><h1 class="truncate">' + title + '</h1><p class="truncate">' + sub + '</p></div>'
    + (extra || '') + '</div>';
}
const NSTEP = '<script>function nstep(id,d,mn,mx){var e=document.getElementById(id);if(!e)return;var v=(parseInt(e.value||mn,10)||mn)+d;v=Math.max(mn,Math.min(mx,v));e.value=v;}</script>';

export function usersPage(sess, list, o) {
  const msg = o.ok ? alertBox('ok', 'Done', esc(o.ok)) : o.error ? alertBox('err', 'Error', esc(o.error)) : '';
  const rows = list.map(u =>
    '<tr data-search="' + esc((u.username + ' ' + (u.invited || '')).toLowerCase()) + '" data-role="' + esc(u.role) + '" data-status="' + (u.is_blocked ? 'blocked' : 'active') + '">'
    + '<td><div class="flex items-center gap-2.5"><div class="w-9 h-9 rounded-lg avatar-premium text-white flex items-center justify-center font-extrabold text-sm shrink-0">' + esc(u.username.substring(0, 1).toUpperCase()) + '</div>'
    + '<div class="min-w-0"><p class="font-bold text-[13px] truncate">' + esc(u.username) + '</p>' + (u.invited ? '<p class="text-[11px] truncate" style="color:var(--muted)">by ' + esc(u.invited) + '</p>' : '') + '</div></div></td>'
    + '<td><span class="chip ' + (u.role === 'OWNER' || u.role === 'PROFESSOR' ? 'chip-i' : u.role === 'ADMIN' ? 'chip-a' : 'chip-n') + '">' + esc(u.role) + '</span></td>'
    + '<td>' + (u.is_blocked ? '<span class="chip chip-r">Blocked</span>' : '<span class="chip chip-g">Active</span>') + '</td>'
    + '<td class="mono">Rs ' + (u.balance | 0) + '</td>'
    + '<td><form method="POST" class="row-actions items-center"><input type="hidden" name="target_id" value="' + u.id + '">'
    + '<input type="number" name="amount" placeholder="Amt" aria-label="Amount" class="clay-card px-2 py-1.5 text-xs rounded-lg" style="width:76px;">'
    + '<button name="action" value="add_balance" class="mini-btn" title="Add balance"><i class="bi bi-plus-lg"></i></button>'
    + '<button name="action" value="deduct_balance" class="mini-btn" title="Deduct balance"><i class="bi bi-dash-lg"></i></button>'
    + (u.id !== sess.id
      ? '<button name="action" value="toggle_block" onclick="return confirm(\'' + (u.is_blocked ? 'Unblock' : 'Block') + ' this user?\')" class="mini-btn ' + (u.is_blocked ? '' : 'danger') + '" title="' + (u.is_blocked ? 'Unblock' : 'Block') + '"><i class="bi ' + (u.is_blocked ? 'bi-unlock' : 'bi-lock') + '"></i></button>'
      : '<span class="chip chip-n">you</span>') + '</form></td></tr>'
  ).join('');
  return hero('bi-people-fill', 'Users', list.length + ' in scope • balance + block control', '')
    + msg
    + '<div class="toolbar"><div class="grow inp-icon"><i class="bi bi-search"></i><input id="uq" placeholder="Search user…" oninput="filterUsers()" class="w-full clay-card px-4 py-2.5 text-sm rounded-xl focus:outline-none"></div>'
    + '<select id="us" onchange="filterUsers()" class="clay-card custom-select px-3 py-2.5 text-sm font-bold rounded-xl"><option value="">All statuses</option><option value="active">Active</option><option value="blocked">Blocked</option></select>'
    + '<select id="ur" onchange="filterUsers()" class="clay-card custom-select px-3 py-2.5 text-sm font-bold rounded-xl"><option value="">All roles</option><option>OWNER</option><option>ADMIN</option><option>RESELLER</option><option>PROFESSOR</option></select></div>'
    + '<div class="tbl-wrap"><table class="tbl" id="utbl"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Balance</th><th>Actions</th></tr></thead><tbody>'
    + (rows || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:28px;">No users</td></tr>')
    + '</tbody></table></div>'
    + '<script>function filterUsers(){var q=(document.getElementById("uq").value||"").toLowerCase(),s=document.getElementById("us").value,r=document.getElementById("ur").value;document.querySelectorAll("#utbl tbody tr[data-search]").forEach(function(x){var ok=(!q||x.getAttribute("data-search").indexOf(q)>=0)&&(!s||x.getAttribute("data-status")===s)&&(!r||x.getAttribute("data-role")===r);x.style.display=ok?"":"none";});}</script>';
}

export function adminsPage(list, viewUser, viewKeys, o) {
  const msg = o.ok ? alertBox('ok', 'Done', esc(o.ok)) : '';
  if (viewUser) {
    const rows = viewKeys.map(k => '<div class="clay-card p-3 rounded-2xl flex items-center gap-2"><code class="flex-1 font-mono text-xs font-bold break-all min-w-0">' + esc(k.key_value) + '</code><span class="text-[10px] font-extrabold shrink-0 ' + (k.is_blocked ? 'text-red-500' : 'text-emerald-500') + '">' + (k.is_blocked ? 'BLOCKED' : 'ACTIVE') + '</span><form method="POST" class="inline shrink-0"><input type="hidden" name="target_user_id" value="' + viewUser.id + '"><input type="hidden" name="key_id" value="' + k.id + '"><button name="action" value="toggle_key_block" title="Block/Unblock" class="w-8 h-8 rounded-xl clay-card text-amber-600 text-xs"><i class="bi bi-lock"></i></button> <button name="action" value="delete_key" onclick="return confirm(\'Delete key?\')" title="Delete" class="w-8 h-8 rounded-xl clay-card text-red-500 text-xs"><i class="bi bi-trash"></i></button></form></div>').join('');
    return hero('bi-person-badge-fill', esc(viewUser.username), viewKeys.length + ' keys', '<a href="/admins" class="shrink-0 px-4 py-2.5 rounded-xl bg-white/20 border border-white/30 text-white text-xs font-extrabold">← Back</a>') + msg + '<div class="space-y-2">' + (rows || '<div class="glass-card p-8 text-center text-sm text-slate-400">No keys</div>') + '</div>';
  }
  const rows = list.map(u => '<a href="/admins?view_keys=' + u.id + '" class="glass-card p-4 md:p-5 flex items-center gap-3 relative overflow-hidden"><div class="absolute top-0 left-0 right-0 h-1 avatar-premium"></div><div class="w-12 h-12 rounded-2xl avatar-premium text-white flex items-center justify-center font-black text-lg shrink-0">' + esc(u.username.substring(0, 1).toUpperCase()) + '</div><div class="flex-1 min-w-0"><p class="font-black text-sm truncate">' + esc(u.username) + '</p><p class="text-[11px] text-slate-500 mt-0.5"><span class="font-extrabold text-slate-600">' + esc(u.role) + '</span> • ' + (u.total_keys | 0) + ' keys</p></div><span class="btn-premium px-4 py-2 rounded-xl text-[11px] font-extrabold shrink-0">Keys <i class="bi bi-chevron-right"></i></span></a>').join('');
  return hero('bi-person-badge-fill', 'Admin Manager', list.length + ' admins / resellers — tap to see keys', '') + msg + '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' + (rows || '<div class="glass-card p-8 text-center text-sm text-slate-400">Nobody yet</div>') + '</div>';
}

export function permissionsPage(list, o) {
  const msg = o.ok ? alertBox('ok', 'Done', esc(o.ok)) : '';
  const rows = list.map(u => '<div class="glass-card p-4 md:p-5 relative overflow-hidden"><div class="absolute top-0 left-0 right-0 h-1 avatar-premium"></div>'
    + '<div class="flex items-center gap-3"><div class="w-11 h-11 rounded-2xl avatar-premium text-white flex items-center justify-center font-black shrink-0">' + esc(u.username.substring(0, 1).toUpperCase()) + '</div>'
    + '<div class="flex-1 min-w-0"><p class="font-black text-sm truncate">' + esc(u.username) + ' <span class="text-[10px] font-bold text-slate-400">' + esc(u.role) + '</span></p>'
    + '<div class="flex gap-1.5 mt-1.5"><span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg ' + ((u.can_generate_referral | 0) ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400') + '">Referral ' + ((u.can_generate_referral | 0) ? 'ON' : 'OFF') + '</span><span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600">Limit: ' + ((u.referral_limit | 0) || '∞') + '</span></div></div>'
    + '<form method="POST" class="shrink-0"><input type="hidden" name="target_id" value="' + u.id + '"><input type="hidden" name="action" value="toggle_ref"><label class="sw"><input type="checkbox"' + ((u.can_generate_referral | 0) ? ' checked' : '') + ' onchange="this.form.submit()"><span class="tr"></span></label></form></div>'
    + '<form method="POST" class="flex gap-2 mt-3 items-center"><input type="hidden" name="target_id" value="' + u.id + '"><input type="hidden" name="action" value="update_limit"><div class="stepper clay-card px-2 rounded-xl"><button type="button" class="font-black px-2" onclick="nstep(\'rl-' + u.id + '\',-1,0,9999)">−</button><input type="number" id="rl-' + u.id + '" name="ref_limit" min="0" max="9999" value="' + (u.referral_limit | 0) + '" class="w-16 text-center font-black bg-transparent focus:outline-none"><button type="button" class="font-black px-2" onclick="nstep(\'rl-' + u.id + '\',1,0,9999)">+</button></div><span class="text-[11px] text-slate-400 font-bold">0 = ∞</span><button class="btn-premium px-4 py-2 rounded-xl text-xs font-extrabold ml-auto">Set Limit</button></form></div>').join('');
  return hero('bi-shield-lock-fill', 'Permissions', 'Referral rights • 0 = unlimited', '') + msg + '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' + (rows || '<div class="glass-card p-8 text-center text-sm text-slate-400">Nobody</div>') + '</div>' + NSTEP;
}

export function referralPage(sess, list, o) {
  const ownerLike = sess.role === 'OWNER' || sess.role === 'PROFESSOR';
  const saved = o.ok === 'Saved.';
  const msg = o.ok ? alertBox('ok', saved ? 'Quota Saved' : 'Referral Generated!', saved ? 'Admin referral quota updated.' : '<code class="font-mono font-black">' + esc(o.ok) + '</code> <button onclick="doCopy(\'' + esc(o.ok) + '\',this)" class="underline font-bold">Copy</button>') : o.error ? alertBox('err', 'Error', esc(o.error)) : '';
  const quota = o.quota;
  const quotaFull = !!quota && quota.limit > 0 && quota.used >= quota.limit;
  const quotaBlocked = !!quota && (!quota.can || quotaFull);
  const quotaBar = quota
    ? '<div class="flex flex-wrap items-center gap-1.5 mb-4"><span class="text-[11px] font-extrabold px-2.5 py-1 rounded-lg ' + (quota.can ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500') + '">Referrals ' + (quota.can ? 'ON' : 'OFF') + '</span><span class="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600">Quota: ' + (quota.limit > 0 ? quota.used + ' / ' + quota.limit + ' used' : '∞ unlimited') + '</span><span class="text-[11px] font-bold text-slate-400">Owner-controlled</span></div>'
    : '';
  const rows = list.map(r => '<div class="clay-card p-3.5 rounded-2xl"><div class="flex items-center gap-2"><code class="flex-1 font-mono text-sm font-black min-w-0 break-all">' + esc(r.code) + '</code><button type="button" onclick="doCopy(\'' + esc(r.code) + '\',this)" title="Copy" class="clay-card w-9 h-9 rounded-xl text-slate-500 shrink-0"><i class="bi bi-clipboard"></i></button><form method="POST" onsubmit="return confirm(\'Delete referral?\')" class="shrink-0"><input type="hidden" name="del_code" value="' + esc(r.code) + '"><button name="action" value="delete_ref" class="clay-card px-3 py-2 rounded-xl text-red-500 text-[11px] font-extrabold"><i class="bi bi-trash"></i> Delete</button></form></div>'
    + '<div class="flex gap-1.5 mt-2 flex-wrap"><span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600">' + esc(r.role) + '</span><span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-purple-50 text-purple-600">' + r.duration + ' days</span><span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-600">Rs ' + r.balance + '</span>' + (r.used ? '<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-red-50 text-red-500">USED</span>' : '<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-500">FRESH</span>') + '</div></div>').join('');
  const genForm = quotaBlocked
    ? alertBox('err', 'Referral Locked', quota.can ? 'Owner-set limit poori ho gayi (' + quota.used + '/' + quota.limit + ').' : 'Owner ne tumhara referral generation OFF kar diya hai.')
    : '<form method="POST" class="glass-card p-5 md:p-6 mb-4 relative overflow-hidden"><input type="hidden" name="action" value="generate"><div class="absolute top-0 left-0 right-0 h-1 avatar-premium"></div>'
    + '<h3 class="font-black mb-3"><i class="bi bi-plus-circle mr-1"></i>Generate Referral Code</h3><div class="grid grid-cols-3 gap-2">'
    + '<div><label class="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Role</label><select name="role" class="w-full clay-card custom-select px-3 py-2.5 text-xs font-extrabold rounded-xl">' + (ownerLike ? '<option>OWNER</option><option>ADMIN</option>' : '') + '<option selected>RESELLER</option></select></div>'
    + '<div><label class="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Days</label><div class="stepper clay-card px-1 rounded-xl"><button type="button" class="font-black px-1.5" onclick="nstep(\'rf-d\',-1,1,3650)">−</button><input type="number" id="rf-d" name="duration" value="30" min="1" max="3650" class="w-12 text-center font-black bg-transparent focus:outline-none text-sm"><button type="button" class="font-black px-1.5" onclick="nstep(\'rf-d\',1,1,3650)">+</button></div></div>'
    + '<div><label class="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Balance Rs</label><input type="number" name="balance" value="0" min="0" class="w-full clay-card px-3 py-2.5 text-xs font-bold rounded-xl"></div></div>'
    + '<button class="btn-premium w-full py-3.5 rounded-2xl text-xs font-extrabold uppercase mt-3"><i class="bi bi-magic"></i> Generate Code</button></form>';
  const adminRows = (o.admins || []).map(u => '<div class="clay-card p-3.5 rounded-2xl"><div class="flex items-center gap-2.5">'
    + '<div class="w-9 h-9 rounded-lg avatar-premium text-white flex items-center justify-center font-extrabold text-sm shrink-0">' + esc(u.username.substring(0, 1).toUpperCase()) + '</div>'
    + '<div class="flex-1 min-w-0"><p class="font-bold text-[13px] truncate">' + esc(u.username) + '</p>'
    + '<div class="flex gap-1.5 mt-1 flex-wrap"><span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg ' + ((u.can_generate_referral | 0) ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400') + '">Referral ' + ((u.can_generate_referral | 0) ? 'ON' : 'OFF') + '</span><span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600">Limit: ' + ((u.referral_limit | 0) || '∞') + '</span></div></div>'
    + '<form method="POST" class="shrink-0"><input type="hidden" name="target_id" value="' + u.id + '"><input type="hidden" name="action" value="toggle_ref"><label class="sw"><input type="checkbox"' + ((u.can_generate_referral | 0) ? ' checked' : '') + ' onchange="this.form.submit()"><span class="tr"></span></label></form></div>'
    + '<form method="POST" class="flex gap-2 mt-3 items-center"><input type="hidden" name="target_id" value="' + u.id + '"><input type="hidden" name="action" value="update_limit"><div class="stepper clay-card px-2 rounded-xl"><button type="button" class="font-black px-2" onclick="nstep(\'rl-' + u.id + '\',-1,0,9999)">−</button><input type="number" id="rl-' + u.id + '" name="ref_limit" min="0" max="9999" value="' + (u.referral_limit | 0) + '" class="w-16 text-center font-black bg-transparent focus:outline-none"><button type="button" class="font-black px-2" onclick="nstep(\'rl-' + u.id + '\',1,0,9999)">+</button></div><span class="text-[11px] text-slate-400 font-bold">0 = ∞</span><button class="btn-premium px-4 py-2 rounded-xl text-xs font-extrabold ml-auto">Set Limit</button></form></div>').join('');
  const adminQuota = ownerLike
    ? '<div class="glass-card p-5 md:p-6 mb-4 relative overflow-hidden"><div class="absolute top-0 left-0 right-0 h-1 avatar-premium"></div>'
    + '<h3 class="font-black mb-1"><i class="bi bi-person-gear mr-1"></i>Admin Reseller Quota</h3><p class="text-[11px] text-slate-400 font-bold mb-3">Har Admin kitne reseller referral nikaal sakta hai • 0 = ∞</p>'
    + '<div class="space-y-3">' + (adminRows || '<div class="clay-card p-4 text-center text-xs font-bold text-slate-400 rounded-2xl">Abhi koi Admin nahi hai</div>') + '</div></div>'
    : '';
  return hero('bi-diagram-3-fill', 'Referrals', list.length + ' codes • role + validity + balance', '') + msg + quotaBar + genForm + adminQuota
    + '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' + (rows || '<div class="glass-card p-8 text-center text-sm text-slate-400">No referrals yet</div>') + '</div>' + NSTEP;
}
