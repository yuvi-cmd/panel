import { esc } from '../ui.js';
import { pageHead, alertBox } from '../panel-ui.js';

export const KEY_PRICING = { '2H': 10, '1D': 80, '3D': 150, '7D': 250, '15D': 350, '30D': 500, '60D': 900 };
export const KEY_DURATIONS = ['2H', '1D', '3D', '7D', '15D', '30D', '60D'];
export const BULK_MAX = 500;

function pcard(label, val, icon, extra) {
  return '<div class="glass-card p-5"><div class="flex items-start justify-between gap-3">'
    + '<div class="min-w-0"><p class="kpi-label">' + label + '</p>'
    + '<p class="kpi-val truncate">' + val + '</p>' + (extra || '') + '</div>'
    + '<div class="stat-ic"><i class="bi ' + icon + '"></i></div></div></div>';
}

function kpi(label, val, foot) {
  return '<div class="glass-card p-5"><p class="kpi-label">' + label + '</p><p class="kpi-val">' + val + '</p>' + (foot ? '<p class="kpi-foot">' + foot + '</p>' : '') + '</div>';
}

export function panelDashboard(sess, stats, balanceText) {
  const role = sess.role;
  const sub = role === 'OWNER' || role === 'PROFESSOR' ? 'Panel network at a glance'
    : role === 'ADMIN' ? 'Your team and keys at a glance' : 'Your keys at a glance';
  let kpis = '';
  if (role === 'OWNER' || role === 'PROFESSOR') {
    kpis = '<div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">'
      + kpi('Balance', esc(balanceText), 'owner wallet')
      + kpi('Total keys', stats.total_keys || 0, (stats.active_keys || 0) + ' active')
      + kpi('Admins', stats.total_admins || 0, (stats.admin_keys || 0) + ' keys by them')
      + kpi('Resellers', stats.total_resellers || 0, (stats.reseller_keys || 0) + ' keys by them') + '</div>';
  } else if (role === 'ADMIN') {
    kpis = '<div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">'
      + kpi('Balance', esc(balanceText))
      + kpi('Team keys', stats.team_keys || 0, 'you + your resellers')
      + kpi('My keys', stats.my_keys || 0, (stats.my_active_keys || 0) + ' active')
      + kpi('Resellers', stats.my_resellers || 0, (stats.my_reseller_keys || 0) + ' keys by them') + '</div>';
  } else {
    kpis = '<div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">'
      + kpi('Balance', esc(balanceText))
      + kpi('Total keys', stats.my_keys || 0)
      + kpi('Active keys', stats.my_active_keys || 0, 'ready to use') + '</div>';
  }
  return '<div class="mb-5"><p class="text-xs font-bold uppercase tracking-widest" style="color:var(--faint)"><span id="istdate">Today</span> · ' + esc(sess.panel_code || '') + '</p>'
    + '<div class="mt-1 flex flex-wrap items-end justify-between gap-3"><h1 class="text-2xl md:text-[28px] font-extrabold tracking-tight" style="color:var(--ink)"><span id="greet">Hello, </span>' + esc(sess.username) + '</h1>'
    + '<div class="flex gap-2 shrink-0"><a href="/generate" class="btn-premium px-4 py-2.5 rounded-xl text-xs font-bold"><i class="bi bi-plus-circle"></i> Generate</a>'
    + '<a href="/keys" class="mini-btn" style="padding:10px 16px;font-size:12px;">Manage keys</a></div></div>'
    + '<p class="text-[13px] mt-1" style="color:var(--muted)">' + sub + '</p></div>'
    + '<script>(function(){try{var now=new Date();var h=parseInt(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"numeric",hour12:false}).format(now),10);document.getElementById("greet").textContent=(h<12?"Good morning, ":h<17?"Good afternoon, ":"Good evening, ");document.getElementById("istdate").textContent=new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",weekday:"long",day:"numeric",month:"long"}).format(now);}catch(e){}})();</script>'
    + kpis
    + '<div class="grid grid-cols-1 xl:grid-cols-3 gap-4">'
    + '<div class="xl:col-span-2"><h2 class="text-sm font-extrabold mb-2" style="color:var(--ink)">Jump in</h2><div class="glass-card p-2.5">'
    + '<a href="/generate" class="linkrow mb-2"><span class="stat-ic"><i class="bi bi-key-fill"></i></span><span>Generate keys<span class="block text-xs font-medium" style="color:var(--muted)">Plans, limits and bulk</span></span><i class="bi bi-chevron-right chev"></i></a>'
    + '<a href="/keys" class="linkrow mb-2"><span class="stat-ic"><i class="bi bi-view-list"></i></span><span>Key manager<span class="block text-xs font-medium" style="color:var(--muted)">Search, reset, extend, block</span></span><i class="bi bi-chevron-right chev"></i></a>'
    + '<a href="/api-test" class="linkrow"><span class="stat-ic"><i class="bi bi-broadcast"></i></span><span>Test the API<span class="block text-xs font-medium" style="color:var(--muted)">Connect &amp; encrypt, live</span></span><i class="bi bi-chevron-right chev"></i></a>'
    + '</div></div>'
    + '<div><h2 class="text-sm font-extrabold mb-2" style="color:var(--ink)">Panel health</h2><div class="glass-card p-4">'
    + '<div class="space-y-3 text-[13px]" style="color:var(--muted)">'
    + '<p class="flex items-center justify-between gap-2">Client API <span class="chip chip-g">Operational</span></p>'
    + '<p class="flex items-center justify-between gap-2">Device binding <span class="chip chip-g">Enforced</span></p>'
    + '<p class="flex items-center justify-between gap-2">Login lock <span class="chip chip-g">On</span></p>'
    + '<p class="flex items-center justify-between gap-2">Tenant isolation <span class="chip chip-g">On</span></p>'
    + '</div></div></div></div>';
}

export function panelGenerate(sess, o) {
  const isOwner = sess.role === 'OWNER' || sess.role === 'PROFESSOR';
  const srvList = ((o.versions && o.versions.length) ? o.versions : ['PRIVATE', 'PUBLIC', 'ADMIN', 'SAFE'].map(s => ({ name: s, tag: '' })))
    .map(v => ({ name: String(v.name || '').toUpperCase(), tag: String(v.tag || '').toUpperCase() }));
  const msg = o.ok ? alertBox('ok', 'Keys Generated!', esc(o.ok))
    : o.error ? alertBox('err', 'Error', esc(o.error)) : '';
  const pills = KEY_DURATIONS.map(d => '<div class="pill' + (d === '30D' ? ' on' : '') + '" data-dur="' + d + '" onclick="pickDur(this)">' + d + '<div style="font-size:10px;opacity:.8">Rs' + KEY_PRICING[d] + '</div></div>').join('');
  const quick = [1, 10, 50, 100, 500].map(q => '<div class="pill' + (q === 1 ? ' on' : '') + '" data-amt="' + q + '" onclick="setAmt(' + q + ')">' + q + '</div>').join('');
  return '<div class="pagehead"><div class="ph-ic"><i class="bi bi-key-fill"></i></div>'
    + '<div class="flex-1 min-w-0"><h1 class="truncate">Generate keys</h1><p class="truncate">' + (isOwner ? 'Unlimited generation (OWNER)' : 'Cost balance se katega — neeche live total dekho') + '</p></div>'
    + '<span class="chip chip-i shrink-0">PRICED</span></div>'
    + msg
    + '<form method="POST" id="genForm" class="glass-card p-5 md:p-7"><div class="space-y-5">'
    + '<div class="clay-card p-4 rounded-2xl"><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2"><span class="inline-flex items-center justify-center w-5 h-5 rounded-lg avatar-premium text-white text-[10px] font-black mr-1">1</span> Duration</label><input type="hidden" name="duration" id="f-dur" value="30D"><div class="grid grid-cols-4 md:grid-cols-7 gap-2">' + pills + '</div></div>'
    + '<div class="clay-card p-4 rounded-2xl"><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2"><span class="inline-flex items-center justify-center w-5 h-5 rounded-lg avatar-premium text-white text-[10px] font-black mr-1">2</span> Device Limit <span class="normal-case font-medium text-slate-400">(har key par)</span></label><div class="stepper"><button type="button" onclick="step(\'f-lim\',-1)">−</button><input type="number" name="device_limit" id="f-lim" min="1" max="10000" value="1" oninput="calc()" style="max-width:90px"><button type="button" onclick="step(\'f-lim\',1)">+</button></div></div>'
    + '<div class="clay-card p-4 rounded-2xl"><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2"><span class="inline-flex items-center justify-center w-5 h-5 rounded-lg avatar-premium text-white text-[10px] font-black mr-1">3</span> Bulk Quantity <span class="normal-case font-medium text-slate-400">(seedha type karo — 1 se ' + BULK_MAX + ' tak)</span></label>'
    + '<div class="flex flex-col sm:flex-row gap-3 items-stretch"><div class="stepper flex-1"><button type="button" onclick="step(\'f-amt\',-1)">−</button><input type="number" name="bulk_amount" id="f-amt" min="1" max="' + BULK_MAX + '" value="1" inputmode="numeric" oninput="calc()" style="min-width:80px"><button type="button" onclick="step(\'f-amt\',1)">+</button></div>'
    + '<label class="feature-card flex-1" id="bulkCard" style="margin:0"><input type="checkbox" name="is_bulk" id="f-bulk" value="1" onchange="bulkToggle(this)"><span class="text-sm font-bold">Bulk mode</span></label></div>'
    + '<div class="grid grid-cols-5 gap-2 mt-3" id="amtQuick">' + quick + '</div></div>'
    + '<div class="clay-card p-4 rounded-2xl"><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2"><span class="inline-flex items-center justify-center w-5 h-5 rounded-lg avatar-premium text-white text-[10px] font-black mr-1">4</span> Custom Key <span class="normal-case font-medium text-slate-400">(sirf single key par — bulk me auto OFF)</span></label><input type="text" name="custom_key" id="f-custom" maxlength="50" placeholder="Optional — khaali chhodo to auto key" class="w-full clay-card px-4 py-3 text-sm font-mono rounded-2xl focus:outline-none"></div>'
    + (isOwner ? '<div class="clay-card p-4 rounded-2xl"><label class="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2"><span class="inline-flex items-center justify-center w-5 h-5 rounded-lg avatar-premium text-white text-[10px] font-black mr-1">5</span> Server Type (OWNER) <span class="normal-case font-medium text-slate-400">— Mod / loader versions</span></label><input type="hidden" name="server_type" id="f-srv" value="' + esc(srvList[0].name) + '"><div class="grid grid-cols-2 md:grid-cols-4 gap-2">' + srvList.map((s, i) => '<div class="pill' + (i === 0 ? ' on' : '') + '" data-srv="' + esc(s.name) + '" onclick="pickSrv(this)">' + esc(s.name) + (s.tag ? '<div style="font-size:10px;opacity:.8">' + esc(s.tag) + '</div>' : '') + '</div>').join('') + '</div></div>' : '')
    + '<div class="costbar"><div><p class="text-[10px] font-extrabold text-slate-400 uppercase">Total Cost</p><p class="text-3xl font-black text-slate-800" id="costOut">Rs 500</p></div><p class="text-[11px] text-slate-500 font-semibold text-right" id="costSub">1 key × 1 device</p></div>'
    + '<button class="btn-premium w-full py-4 rounded-2xl font-extrabold text-sm uppercase tracking-wider"><i class="bi bi-magic"></i> Generate Key(s)</button>'
    + '</div></form>'
    + '<script>var PRICES=' + JSON.stringify(KEY_PRICING) + ';var AMAX=' + BULK_MAX + ';'
    + 'function pickDur(el){document.getElementById("f-dur").value=el.getAttribute("data-dur");var ps=el.parentElement.querySelectorAll(".pill");for(var i=0;i<ps.length;i++)ps[i].classList.remove("on");el.classList.add("on");calc();}'
    + 'function pickSrv(el){document.getElementById("f-srv").value=el.getAttribute("data-srv");var ps=el.parentElement.querySelectorAll(".pill");for(var i=0;i<ps.length;i++)ps[i].classList.remove("on");el.classList.add("on");}'
    + 'function step(id,d){var el=document.getElementById(id);var v=(parseInt(el.value||"1",10)||1)+d;v=Math.max(parseInt(el.min||"1",10),Math.min(parseInt(el.max||"50",10),v));el.value=v;syncAmt();calc();}'
    + 'function setAmt(v){document.getElementById("f-amt").value=v;syncAmt();calc();}'
    + 'function syncAmt(){var a=Math.max(1,Math.min(AMAX,parseInt(document.getElementById("f-amt").value||"1",10)||1));document.getElementById("f-amt").value=a;var b=document.getElementById("f-bulk");if(b)b.checked=a>1;var c=document.getElementById("bulkCard");if(c)c.classList.toggle("checked",a>1);var qs=document.getElementById("amtQuick");if(qs){var ps=qs.querySelectorAll(".pill");for(var i=0;i<ps.length;i++)ps[i].classList.toggle("on",ps[i].getAttribute("data-amt")==String(a));}}'
    + 'function bulkToggle(cb){document.getElementById("bulkCard").classList.toggle("checked",cb.checked);if(!cb.checked){document.getElementById("f-amt").value=1;syncAmt();}calc();}'
    + 'function calc(){var dap=document.getElementById("f-amt");var a=Math.max(1,Math.min(AMAX,parseInt(dap.value||"1",10)||1));dap.value=a;var d=document.getElementById("f-dur").value;var l=Math.max(1,Math.min(10000,parseInt(document.getElementById("f-lim").value||"1",10)||1));document.getElementById("f-lim").value=l;var t=(PRICES[d]||10)*l*a;document.getElementById("costOut").textContent="Rs "+t;document.getElementById("costSub").textContent=a+" key(s) x "+l+" device(s) - "+d;var b=document.getElementById("f-bulk");if(b&&b.checked!==(a>1)){b.checked=a>1;document.getElementById("bulkCard").classList.toggle("checked",a>1);}var ci=document.getElementById("f-custom");if(ci){ci.disabled=a>1;ci.style.opacity=a>1?"0.4":"1";ci.placeholder=a>1?"Bulk ON hai — custom key band":"Optional — khaali chhodo to auto key";}}'
    + 'syncAmt();calc();</script>'
    + (o.keys && o.keys.length ? '<div class="glass-card p-5 mt-5"><div class="flex items-center justify-between mb-3"><h3 class="font-black">Generated (' + o.keys.length + ')</h3><button onclick="copyAll(this)" class="clay-card px-3 py-1.5 text-xs font-bold rounded-xl"><i class="bi bi-clipboard"></i> Copy All</button></div><div class="space-y-2" id="genKeys" style="max-height:420px;overflow-y:auto">' + o.keys.map(k => '<div class="clay-card p-3 flex items-center gap-2 rounded-2xl"><code class="flex-1 font-mono text-sm font-bold break-all gk">' + esc(k) + '</code><button onclick="doCopy(\'' + esc(k) + '\',this)" class="clay-card w-9 h-9 rounded-xl shrink-0"><i class="bi bi-clipboard"></i></button></div>').join('') + '</div></div><script>function copyAll(btn){var t="";document.querySelectorAll("#genKeys .gk").forEach(function(e){t+=e.innerText.trim()+"\\n";});doCopy(t.trim(),btn);}</script>' : '');
}

const SRV_BADGE = { PRIVATE: 'bg-blue-50 text-blue-600', PUBLIC: 'bg-emerald-50 text-emerald-600', ADMIN: 'bg-purple-50 text-purple-600', SAFE: 'bg-amber-50 text-amber-600' };

export function panelKeyList(sess, keys, o) {
  const isOwner = sess.role === 'OWNER' || sess.role === 'PROFESSOR';
  const srvOpts = ((o.versions && o.versions.length) ? o.versions : ['PRIVATE', 'PUBLIC', 'ADMIN', 'SAFE'].map(s => ({ name: s })))
    .map(v => '<option>' + esc(String(v.name).toUpperCase()) + '</option>').join('');
  const msg = o.ok ? alertBox('ok', 'Done', esc(o.ok)) : o.error ? alertBox('err', 'Error', esc(o.error)) : '';
  const bulk = isOwner ? '<form method="POST" onsubmit="return confirm(\'Bulk action pakka?\')" class="glass-card p-4 mb-4 flex flex-wrap gap-2 items-center"><input type="hidden" name="bulk" value="1"><select name="action" class="clay-card px-3 py-2 text-xs font-bold rounded-xl"><option value="delete_expired">Delete Expired</option><option value="delete_all">Delete ALL (panel)</option><option value="extend_all">Extend ALL +</option></select><input type="number" name="extend_val" placeholder="days" class="clay-card px-3 py-2 text-xs w-24 rounded-xl"><input type="hidden" name="extend_unit" value="D"><button class="btn-premium px-4 py-2 rounded-xl text-xs font-bold">Apply</button></form>' : '';
  const rows = keys.map(k => {
    const used = k.dev_count || 0, lim = Math.max(1, k.device_limit | 0), pct = Math.min(100, Math.round(used / lim * 100));
    const expired = k.expires_at && Date.parse(String(k.expires_at).replace(' ', 'T') + 'Z') < Date.now();
    const st = (k.is_blocked | 0) === 1 ? 'blocked' : expired ? 'expired' : 'active';
    const dot = (k.is_blocked | 0) === 1 ? '#EF4444' : expired ? '#F59E0B' : '#10B981';
    const search = esc(((k.key_value || '') + ' ' + (k.creator || '')).toLowerCase());
    return '<div class="kitem" data-search="' + search + '" data-status="' + st + '">'
      + '<div class="krow">'
      + '<span class="kdot" style="background:' + dot + '"></span>'
      + '<span class="mono kkey blur-sm select-none" id="pk-' + k.id + '">' + esc(k.key_value) + '</span>'
      + '<span class="chip chip-n">' + esc(k.duration) + '</span>'
      + '<button onclick="document.getElementById(\'pk-' + k.id + '\').classList.toggle(\'blur-sm\')" class="icon-btn" aria-label="Reveal key"><i class="bi bi-eye"></i></button>'
      + '<button onclick="doCopy(\'' + esc(k.key_value) + '\',this)" class="icon-btn" aria-label="Copy key"><i class="bi bi-clipboard"></i></button>'
      + '<button onclick="kexp(' + k.id + ')" class="icon-btn" aria-label="Expand details" aria-expanded="false"><i class="bi bi-chevron-down kchev"></i></button>'
      + '</div>'
      + '<div class="kdetail" id="kd-' + k.id + '">'
      + '<div class="kmeta">'
      + '<span>Plan <b>' + esc(k.duration) + ' · ' + esc(k.server_type || 'PRIVATE') + '</b></span>'
      + '<span>Status <b>' + ((k.is_blocked | 0) === 1 ? 'Blocked' : expired ? 'Expired' : 'Active') + '</b></span>'
      + '<span>Devices <b>' + used + '/' + lim + ' · ' + (k.uses | 0) + ' uses</b></span>'
      + '<span>Expires <b>' + esc(k.expires_at || ('pending ' + (k.duration || ''))) + '</b></span>'
      + '<span>By <b>' + esc(k.creator || '?') + '</b></span>'
      + '</div><div class="meter mb-3"><div style="width:' + pct + '%"></div></div>'
      + '<div class="row-actions">'
      + '<form method="POST" class="inline"><input type="hidden" name="key_id" value="' + k.id + '"><input type="hidden" name="action" value="reset_device"><button class="mini-btn"><i class="bi bi-arrow-counterclockwise"></i>Reset devices</button></form>'
      + '<form method="POST" class="inline"><input type="hidden" name="key_id" value="' + k.id + '"><input type="hidden" name="action" value="edit_key"><input type="hidden" name="edit_status" value="' + (k.is_blocked ? '1' : '0') + '"><button class="mini-btn"><i class="bi ' + (k.is_blocked ? 'bi-unlock' : 'bi-lock') + '"></i>' + (k.is_blocked ? 'Unblock' : 'Block') + '</button></form>'
      + '<form method="POST" class="inline" onsubmit="return confirm(\'Delete key?\')"><input type="hidden" name="key_id" value="' + k.id + '"><input type="hidden" name="action" value="delete_key"><button class="mini-btn danger"><i class="bi bi-trash"></i>Delete</button></form>'
      + '</div>'
      + '<form method="POST" class="flex flex-wrap gap-1.5 pt-2.5 mt-1"><input type="hidden" name="key_id" value="' + k.id + '"><input type="hidden" name="action" value="edit_key"><input type="hidden" name="edit_status" value="' + (k.is_blocked ? '0' : '1') + '">'
      + '<input type="number" name="extend_val" placeholder="+days" aria-label="Extend days" class="clay-card px-2 py-1.5 text-xs rounded-lg" style="width:88px;"><input type="hidden" name="extend_unit" value="D">'
      + (isOwner ? '<select name="edit_server" class="clay-card px-2 py-1.5 text-xs font-bold rounded-lg"><option value="">Server~</option>' + srvOpts + '</select>' : '')
      + '<button class="mini-btn accent">Extend / save</button></form>'
      + '</div></div>';
  }).join('');
  return '<div class="pagehead"><div class="ph-ic"><i class="bi bi-view-list"></i></div>'
    + '<div class="flex-1 min-w-0"><h1 class="truncate">Keys</h1><p class="truncate">' + keys.length + ' keys in scope · max 200</p></div>'
    + '<a href="/generate" class="btn-premium px-4 py-2.5 rounded-xl text-xs font-bold shrink-0"><i class="bi bi-plus-lg"></i> New</a></div>'
    + msg + bulk
    + '<div class="toolbar"><div class="grow inp-icon"><i class="bi bi-search"></i><input id="kq" placeholder="Search key or creator…" oninput="filterKeys()" class="w-full clay-card px-4 py-2.5 text-sm rounded-xl focus:outline-none"></div>'
    + '<select id="ks" onchange="filterKeys()" class="clay-card custom-select px-3 py-2.5 text-sm font-bold rounded-xl"><option value="">All statuses</option><option value="active">Active</option><option value="blocked">Blocked</option><option value="expired">Expired</option></select></div>'
    + '<div class="klist" id="klist">'
    + (rows || '<div class="glass-card p-8 text-center text-sm" style="color:var(--muted)"><i class="bi bi-inbox text-4xl block mb-2" style="color:var(--faint)"></i>No keys found. <a href="/generate" style="color:var(--acc);font-weight:700;">Generate →</a></div>')
    + '</div>'
    + '<div class="pager"><span id="kcount"></span><span class="flex gap-2"><button class="mini-btn" onclick="kPrev()">← Prev</button><button class="mini-btn" onclick="kNext()">Next →</button></span></div>'
    + '<script>var KPAGE=1;var KPER=20;function kList(){return Array.prototype.slice.call(document.querySelectorAll("#klist .kitem[data-search]"));}'
    + 'function kMatch(){var q=(document.getElementById("kq").value||"").toLowerCase(),s=document.getElementById("ks").value;return kList().filter(function(r){return (!q||r.getAttribute("data-search").indexOf(q)>=0)&&(!s||r.getAttribute("data-status")===s);});}'
    + 'function kRender(){var list=kMatch();var pages=Math.max(1,Math.ceil(list.length/KPER));if(KPAGE>pages)KPAGE=pages;list.forEach(function(r,i){r.style.display=(i>=(KPAGE-1)*KPER&&i<KPAGE*KPER)?"":"none";});document.getElementById("kcount").textContent=list.length+" keys · page "+KPAGE+" of "+pages;}'
    + 'function kPrev(){if(KPAGE>1){KPAGE--;kRender();}}function kNext(){KPAGE++;kRender();}'
    + 'function kexp(id){var d=document.getElementById("kd-"+id);if(!d)return;var it=d.parentElement;var open=it.classList.toggle("open");var b=it.querySelector("[aria-expanded]");if(b)b.setAttribute("aria-expanded",open?"true":"false");}'
    + 'function filterKeys(){KPAGE=1;kRender();}document.addEventListener("DOMContentLoaded",kRender);</script>';
}

export function arcxRand(len) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const r = new Uint8Array(len);
  crypto.getRandomValues(r);
  return [...r].map(b => chars[b % 36]).join('');
}
