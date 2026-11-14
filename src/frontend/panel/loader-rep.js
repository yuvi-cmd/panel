import { esc } from '../ui.js';
import { pageHead, alertBox } from '../panel-ui.js';

// Loader-rep page: Ztrax-compatible encrypted endpoint docs + live tester.
// The live tester calls /api/loader-rep-test (admin only, dry-run: no device
// binding, no `uses` increment) and shows both wire envelopes and decrypted
// JSON.
export function loaderRepPage(o) {
  const base = o.base || '';
  const panel = o.panelCode || 'YUVI_001';
  const endpoint = base + '/loader-rep/' + panel + '/api.php';
  const alias = base + '/ZTRAXPANEL/api.php';
  const secret = o.appSecret || '';

  const copy = (id) => '<button type="button" onclick="doCopy(document.getElementById(\'' + id + '\').innerText,this)" title="Copy" class="clay-card w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-slate-600"><i class="bi bi-link-45deg"></i></button>';

  const endpointRow = (label, icon, color, id, value) =>
    '<div class="clay-card p-3 rounded-2xl flex items-center gap-2">'
    + '<i class="bi ' + icon + ' text-lg shrink-0" style="color:' + color + '"></i>'
    + '<div class="flex-1 min-w-0"><p class="text-[9px] font-extrabold text-slate-400 uppercase">' + label + '</p>'
    + '<code id="' + id + '" class="text-xs font-mono font-bold break-all">' + esc(value) + '</code></div>'
    + copy(id) + '</div>';

  const successJson = '{"status":"success","message":"License valid and HWID bound","expiry":"11/14/2026, 10:24:48 PM IST","timezone":"Asia/Kolkata","timezone_note":"Expiry time is in your local timezone (Asia/Kolkata), despite the \'IST\' label","device_limit":1000,"devices_used":470,"package_name":"com.pubg.imobile"}';

  const errRows = [
    ['wrong app_secret', '401', 'all old app closed'],
    ['HWID not 64 lowercase hex', '400', 'Invalid HWID format'],
    ['empty / >64 char key', '400', 'Invalid license key format'],
    ['key not found or inactive', '200', 'Invalid license key'],
    ['key blocked', '200', 'License blocked'],
    ['expired key', '200', 'License expired'],
    ['device limit reached', '200', 'Device limit reached'],
    ['panel inactive', '403', 'Panel is inactive'],
    ['missing ?action=', '400', 'Invalid API request.'],
  ].map((r) => '<tr><td class="py-2 pr-3 text-xs font-semibold text-slate-600">' + r[0] + '</td><td class="py-2 px-2"><span class="text-[10px] font-extrabold px-2 py-0.5 rounded-lg ' + (r[1] === '200' ? 'bg-emerald-50 text-emerald-600' : r[1] === '400' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500') + '">HTTP ' + r[1] + '</span></td><td class="py-2 pl-2"><code class="text-[11px] font-mono text-slate-700">{"status":"error","message":"' + esc(r[2]) + '"}</code></td></tr>').join('');

  const tableStyle = 'width:100%;border-collapse:collapse';

  return pageHead('Loader-rep', 'bi-code-square', 'Ztrax-compatible encrypted license endpoint · same + and logic, served by this panel')
    + alertBox('ok', 'panel_code ' + esc(panel), 'Endpoint is tenant-scoped: keys, HWID devices and `uses` come from the <b>' + esc(panel) + '</b> rows of D1, not from the original battlegrounds-hub server.')
    + '<div class="glass-card p-5 md:p-6 relative overflow-hidden mb-4"><div class="absolute top-0 left-0 right-0 h-1 avatar-premium"></div>'
    + '<h3 class="font-black mb-1"><i class="bi bi-plug-fill mr-1"></i>Endpoint</h3>'
    + '<p class="text-[11px] text-slate-500 mb-3">Wire format original loader jaisa hi hai: <code class="font-mono">base64(key32) + "+++" + base64(ciphertext)</code>. JSON sirf decrypt ke baad milta hai — network par plain JSON nahi jata.</p>'
    + '<div class="space-y-2">'
    + endpointRow('validate_license · POST', 'bi-shield-check', '#10b981', 'lr-ep-val', endpoint + '?action=validate_license')
    + endpointRow('get_update · POST', 'bi-cloud-arrow-down-fill', '#3b82f6', 'lr-ep-upd', endpoint + '?action=get_update')
    + endpointRow('APK POST path · drop-in alias', 'bi-arrow-repeat', '#8b5cf6', 'lr-ep-alias', alias + '?action=validate_license')
    + '</div>'
    + '<div class="mt-3 rounded-xl border border-slate-200 p-3 text-[11px] leading-relaxed" style="color:var(--muted)">'
    + '<b>Headers:</b> <code class="font-mono">Content-Type: application/x-www-form-urlencoded</code> · <b>Body:</b> raw envelope (not JSON). '
    + 'Response bhi wahi envelope hota hai aur <b>request wali 32-byte key echo</b> karta hai — usi key se decrypt karo.'
    + '</div></div>'

    + '<div class="glass-card p-5 md:p-6 relative overflow-hidden mb-4" style="border-left:4px solid #6366f1"><div class="absolute top-0 left-0 right-0 h-1 avatar-premium"></div>'
    + '<h3 class="font-black mb-1"><i class="bi bi-lightning-charge-fill mr-1"></i>APK License Test <span class="text-[10px] font-bold text-slate-400">admin only · dry-run default</span></h3>'
    + '<p class="text-[11px] text-slate-500 mb-3">Do mode: (1) <b>APK post body</b> — jo body APK ne license endpoint par bheji hai wahi paste karo; HWID, key, timezone sab body ke andar se decrypt hote hain. (2) <b>Key + HWID</b> — naya request banao. Yahan koi HWID hardcoded ya auto-generate nahi hota.</p>'
    + '<div class="grid md:grid-cols-4 gap-2">'
    + '<div><label class="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Mode</label><select id="lr-mode" onchange="lrMode()" class="w-full clay-card custom-select px-3 py-2.5 text-sm font-bold rounded-xl"><option value="body">APK post body</option><option value="fields">Key + HWID</option></select></div>'
    + '<div><label class="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Action</label><select id="lr-action" class="w-full clay-card custom-select px-3 py-2.5 text-sm font-bold rounded-xl"><option value="validate_license">validate_license</option><option value="get_update">get_update</option></select></div>'
    + '<div><label class="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">panel_code</label><input id="lr-panel" value="' + esc(panel) + '" class="w-full clay-card px-3 py-2.5 text-sm font-mono rounded-xl focus:outline-none"></div>'
    + '<div><label class="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Writes</label><label class="clay-card px-3 py-2.5 rounded-xl flex items-center gap-2 text-[11px] font-bold text-slate-600"><input type="checkbox" id="lr-real" class="accent-indigo-500"> Real mode (bind)</label></div>'
    + '</div>'
    + '<div id="lr-body-wrap" class="mt-3">'
    + '<label class="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">APK ka exact POST body (<code class="font-mono">b64(key32)+++b64(ct)</code>)</label>'
    + '<textarea id="lr-body" rows="4" placeholder="paste the raw body the APK posted — response usi envelope key me aayega" class="w-full clay-card px-3 py-2.5 text-[10px] font-mono rounded-xl focus:outline-none"></textarea>'
    + '<p class="text-[10px] text-slate-400 mt-1">HWID body ke andar se aata hai. Panel koi HWID hardcode nahi karta — jo APK bhejta hai wahi validate/bind hota hai.</p>'
    + '</div>'
    + '<div id="lr-fields-wrap" class="hidden grid md:grid-cols-3 gap-2 mt-3">'
    + '<div><label class="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">License key (' + esc(panel) + ')</label><input id="lr-key" placeholder="paste panel key" class="w-full clay-card px-3 py-2.5 text-sm font-mono rounded-xl focus:outline-none"></div>'
    + '<div><label class="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">HWID (64 hex)</label><input id="lr-hwid" placeholder="device ka apna HWID — koi default nahi" class="w-full clay-card px-3 py-2.5 text-xs font-mono rounded-xl focus:outline-none"></div>'
    + '<div><label class="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">Timezone</label><select id="lr-tz" class="w-full clay-card custom-select px-3 py-2.5 text-sm font-bold rounded-xl"><option value="Asia/Kolkata">Asia/Kolkata</option><option value="">(empty → UTC)</option><option value="UTC">UTC</option></select></div>'
    + '</div>'
    + '<p class="text-[10px] text-slate-400 mt-2">Real mode off = dry-run (koi bind/uses++ nahi). On = exactly endpoint jaisa response, device bind + <code class="font-mono">uses++</code>.</p>'
    + '<button onclick="lrRun()" class="btn-premium w-full py-3.5 rounded-2xl text-xs font-extrabold uppercase mt-3"><i class="bi bi-send-fill"></i> Send request</button>'
    + '<div class="grid md:grid-cols-2 gap-3 mt-3">'
    + '<div><p class="text-[10px] font-extrabold text-slate-500 uppercase mb-1">1 · Request envelope (wire)</p><pre id="lr-req-raw" class="bg-slate-900 text-slate-100 text-[10px] rounded-2xl p-3 overflow-x-auto whitespace-pre-wrap" style="min-height:86px">—</pre></div>'
    + '<div><p class="text-[10px] font-extrabold text-slate-500 uppercase mb-1">2 · Request decrypted (JSON)</p><pre id="lr-req-plain" class="bg-slate-900 text-cyan-100 text-[10px] rounded-2xl p-3 overflow-x-auto whitespace-pre-wrap" style="min-height:86px">—</pre></div>'
    + '<div><p class="text-[10px] font-extrabold text-slate-500 uppercase mb-1">3 · Response envelope (wire + HTTP)</p><pre id="lr-res-raw" class="bg-slate-900 text-slate-100 text-[10px] rounded-2xl p-3 overflow-x-auto whitespace-pre-wrap" style="min-height:86px">—</pre></div>'
    + '<div><p class="text-[10px] font-extrabold text-slate-500 uppercase mb-1">4 · Response decrypted (JSON)</p><pre id="lr-res-plain" class="bg-slate-900 text-emerald-100 text-[10px] rounded-2xl p-3 overflow-x-auto whitespace-pre-wrap" style="min-height:86px">—</pre></div>'
    + '</div></div>'

    + '<div class="grid md:grid-cols-2 gap-4 mb-4">'
    + '<div class="glass-card p-5"><h3 class="font-black text-sm mb-2"><i class="bi bi-box-arrow-up-right mr-1"></i>Request format</h3>'
    + '<p class="text-[11px] text-slate-500 mb-2">Body bilkul yahi hota hai (plain JSON nahi):</p>'
    + '<pre class="bg-slate-900 text-slate-100 text-[10px] rounded-2xl p-3 overflow-x-auto whitespace-pre-wrap">b64(32-byte key) +++ b64(ciphertext)</pre>'
    + '<p class="text-[11px] text-slate-500 mt-3 mb-1">Decrypt karne par:</p>'
    + '<pre class="bg-slate-900 text-cyan-100 text-[10px] rounded-2xl p-3 overflow-x-auto whitespace-pre-wrap">{"app_secret":"' + esc(secret) + '","hwid":"&lt;64 lowercase hex&gt;","key":"&lt;panel key&gt;","timezone":"Asia/Kolkata"}</pre>'
    + '<p class="text-[11px] text-slate-500 mt-3">get_update body:</p>'
    + '<pre class="bg-slate-900 text-cyan-100 text-[10px] rounded-2xl p-3 overflow-x-auto whitespace-pre-wrap">{"app_secret":"' + esc(secret) + '","package_name":"com.pubg.imobile"}</pre>'
    + '<p class="text-[10px] text-slate-400 mt-2">app_secret override: Worker secret <code class="font-mono">LOADER_REP_SECRET</code>.</p></div>'
    + '<div class="glass-card p-5"><h3 class="font-black text-sm mb-2"><i class="bi bi-box-arrow-in-down-left mr-1"></i>Response format</h3>'
    + '<p class="text-[11px] text-slate-500 mb-2">Success (200, encrypted envelope ke andar):</p>'
    + '<pre class="bg-slate-900 text-emerald-100 text-[10px] rounded-2xl p-3 overflow-x-auto whitespace-pre-wrap">' + esc(successJson) + '</pre>'
    + '<p class="text-[11px] text-slate-500 mt-3 mb-1">Fields: status · message · expiry · timezone · timezone_note · device_limit · devices_used · package_name</p>'
    + '<p class="text-[10px] text-slate-400">`message` = "License valid and HWID bound" pehli bind par, phir "License valid". Expiry SQLite UTC se requested timezone me convert hoti hai (IST label same quirk).</p></div>'
    + '</div>'

    + '<div class="glass-card p-5 md:p-6 mb-4"><h3 class="font-black text-sm mb-2"><i class="bi bi-table mr-1"></i>Error responses (same shapes)</h3>'
    + '<div class="overflow-x-auto"><table style="' + tableStyle + '"><thead><tr class="text-left text-[10px] font-extrabold text-slate-400 uppercase border-b border-slate-200"><th class="py-2 pr-3">Case</th><th class="py-2 px-2">HTTP</th><th class="py-2 pl-2">Decrypted body</th></tr></thead><tbody>' + errRows + '</tbody></table></div></div>'

    + '<div class="grid md:grid-cols-2 gap-4 mb-4">'
    + '<div class="glass-card p-5"><h3 class="font-black text-sm mb-2"><i class="bi bi-shield-lock-fill mr-1"></i>Encryption / decryption logic</h3>'
    + '<pre class="bg-slate-900 text-slate-100 text-[11px] rounded-2xl p-3 overflow-x-auto whitespace-pre-wrap">decrypt: pt[i] = U[ ct[i] ] ^ D[i % 32] ^ key[i % 32]\nencrypt: ct[i] = Uinv[ pt[i] ^ key[i % 32] ^ D[i % 32] ]\n\nwire: b64(key32) +++ b64(ct)\nresponse: same key echo, same cipher</pre>'
    + '<ul class="text-[11px] text-slate-600 mt-3 space-y-1" style="list-style:disc;padding-left:16px">'
    + '<li><b>U</b> = 256-byte permutation of 0..255</li>'
    + '<li><b>D</b> = 32-byte fixed mask</li>'
    + '<li><b>key</b> = 32 random bytes (envelope ka pehla base64 part)</li>'
    + '<li>No IV, no padding, no MAC — length-independent</li>'
    + '<li>Yahi exact tables original Ztrax panel se recover hui thi</li></ul>'
    + '<details class="mt-3"><summary class="cursor-pointer text-[11px] font-bold text-slate-500">U / D tables dekho</summary>'
    + '<p class="text-[10px] font-extrabold text-slate-400 uppercase mt-2 mb-1">U (256)</p><pre class="bg-slate-900 text-slate-100 text-[9px] rounded-xl p-2 overflow-x-auto whitespace-pre-wrap">' + U_STR + '</pre>'
    + '<p class="text-[10px] font-extrabold text-slate-400 uppercase mt-2 mb-1">D (32)</p><pre class="bg-slate-900 text-slate-100 text-[9px] rounded-xl p-2 overflow-x-auto whitespace-pre-wrap">' + D_STR + '</pre>'
    + '</details></div>'
    + '<div class="glass-card p-5"><h3 class="font-black text-sm mb-2"><i class="bi bi-filetype-py mr-1"></i>Reference decrypt (Python)</h3>'
    + '<pre class="bg-slate-900 text-emerald-100 text-[10px] rounded-2xl p-3 overflow-x-auto whitespace-pre-wrap">import base64\n\nU = [...]  # 256 values\nD = [...]  # 32 values\n\ndef dec(ct, key):\n    return bytes(U[ct[i]] ^ D[i % 32] ^ key[i % 32]\n                 for i in range(len(ct)))\n\nbody = open("capture.txt", "rb").read().strip()\nkb, cb = body.split(b"+++", 1)\nkey = base64.b64decode(kb)\nprint(dec(base64.b64decode(cb), key).decode())</pre>'
    + '<p class="text-[11px] text-slate-500 mt-3"><b>Replay:</b> same JSON ko encrypt karke <code class="font-mono">POST {endpoint}?action=validate_license</code> par bhejo. Response ko usi key se decrypt karo.</p>'
    + '<p class="text-[11px] text-slate-500 mt-3 mb-1"><b>APK ka actual POST replay (curl):</b></p>'
    + '<pre class="bg-slate-900 text-emerald-100 text-[10px] rounded-2xl p-3 overflow-x-auto whitespace-pre-wrap">curl -X POST \'' + esc(alias) + '?action=validate_license\' \\\n  -H \'Content-Type: application/x-www-form-urlencoded\' \\\n  --data-binary @apk_post_body.txt</pre>'
    + '<p class="text-[10px] text-slate-400 mt-2">`apk_post_body.txt` = exactly wahi body jo APK ne post ki. HWID us body ke JSON ke andar hota hai — panel use hi validate/bind karta hai, koi hardcoded HWID nahi.</p>'
    + '<p class="text-[11px] text-slate-500 mt-2"><b>panel_code:</b> URL path me hai — <code class="font-mono">/loader-rep/' + esc(panel) + '/api.php</code>. Doosre tenant ke liye uska code daalo; keys usi tenant se aayengi.</p>'
    + '<p class="text-[11px] text-slate-500 mt-2"><b>get_update:</b> Ztrax\'s UpdateManager khud is JSON ko parse karta hai aur <code>library</code> + <code>apk</code> dono nested objects maangta hai (library: version/hash/url/file_size → .so download + sha256 verify; apk: installed app ka apna version/hash → "already up to date"). Library fields original panel ke live-verified .so se aate hain (env: LOADER_REP_LIB_URL / _VERSION / _SHA256 / _SIZE, apk: LOADER_REP_APK_VERSION / _SHA256). Flat fields backward-compat ke liye bhi bheje jaate hain.</p></div>'
    + '</div>'

    + '<script>'
    + 'function lrMode(){var m=document.getElementById("lr-mode").value;document.getElementById("lr-body-wrap").classList.toggle("hidden",m!=="body");document.getElementById("lr-fields-wrap").classList.toggle("hidden",m!=="fields");}'
    + 'async function lrRun(){'
    + 'var a=document.getElementById("lr-req-raw"),b=document.getElementById("lr-req-plain"),c=document.getElementById("lr-res-raw"),d=document.getElementById("lr-res-plain");'
    + 'var mode=document.getElementById("lr-mode").value;'
    + 'var real=document.getElementById("lr-real").checked;'
    + 'var o={panel_code:document.getElementById("lr-panel").value,action:document.getElementById("lr-action").value,dry_run:!real};'
    + 'if(mode==="body"){o.body=document.getElementById("lr-body").value.trim();if(!o.body){d.textContent="PASTE APK POST BODY pehle.";return;}}'
    + 'else{o.key=document.getElementById("lr-key").value;o.hwid=document.getElementById("lr-hwid").value;o.timezone=document.getElementById("lr-tz").value;}'
    + 'if(real&&!confirm("Real mode: device bind + uses++ hoga. Continue?"))return;'
    + 'a.textContent="••• request •••";b.textContent="•••";c.textContent="•••";d.textContent="•••";'
    + 'try{'
    + 'var r=await fetch("/api/loader-rep-test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(o)});'
    + 'var j=await r.json();'
    + 'if(!j.ok){a.textContent="—";b.textContent="—";c.textContent="—";d.textContent="ERROR: "+(j.error||("HTTP "+r.status));return;}'
    + 'a.textContent=j.request.envelope;b.textContent=j.request.plain;'
    + 'c.textContent="HTTP "+j.http+"\\n"+j.response.envelope;'
    + 'd.textContent=JSON.stringify(j.response.json,null,2);'
    + '}catch(e){d.textContent="ERR: "+e;}'
    + '}'
    + '</script>';
}

const U_STR = '0, 214, 14, 225, 152, 25, 253, 154, 123, 132, 124, 51, 244, 104, 97, 106, 139, 108, 218, 52, 114, 95, 107, 117, 153, 55, 68, 133, 165, 35, 238, 102, 129, 74, 177, 24, 61, 36, 92, 219, 47, 135, 241, 86, 4, 42, 100, 7, 150, 31, 252, 13, 158, 226, 157, 56, 9, 66, 60, 198, 207, 118, 224, 221, 8, 170, 41, 141, 53, 142, 178, 17, 161, 189, 131, 167, 195, 205, 57, 48, 143, 136, 134, 128, 235, 239, 250, 34, 3, 209, 5, 65, 125, 247, 243, 181, 176, 162, 126, 148, 183, 187, 96, 22, 105, 173, 130, 213, 186, 120, 197, 21, 160, 159, 19, 119, 38, 91, 87, 20, 228, 127, 251, 84, 212, 80, 54, 78, 26, 240, 208, 196, 71, 77, 163, 46, 113, 40, 103, 39, 168, 185, 45, 72, 49, 191, 137, 28, 109, 255, 217, 245, 44, 234, 89, 174, 147, 201, 99, 15, 69, 232, 18, 200, 211, 222, 229, 246, 79, 121, 12, 23, 62, 146, 59, 82, 171, 1, 27, 70, 37, 32, 202, 156, 50, 98, 164, 43, 138, 231, 2, 169, 83, 227, 190, 88, 182, 85, 101, 216, 248, 16, 144, 194, 93, 180, 175, 67, 140, 192, 75, 254, 210, 249, 6, 215, 223, 237, 10, 115, 112, 230, 179, 111, 188, 172, 90, 199, 63, 30, 233, 184, 166, 110, 122, 155, 116, 64, 242, 204, 81, 94, 149, 11, 58, 73, 33, 29, 236, 206, 145, 76, 193, 220, 151, 203';
const D_STR = '165, 245, 166, 242, 167, 241, 160, 240, 161, 247, 162, 246, 163, 245, 172, 242, 173, 241, 164, 240, 165, 247, 166, 246, 167, 245, 160, 242, 161, 241, 162, 240';