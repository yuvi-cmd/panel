// Legacy NexonCheat startup status endpoint.
//
// libshaitaan.so's nativeApkKillUrl() points the APK at
// `/server/apk_kill.php?cv=<versionName>&t=<ms>`. The Java side reads the
// response as text, then PanelCrypto.e() decodes it:
//
//   base64 -> XOR every byte with 0xA5 -> UTF-8 JSON
//
// A 302/HTML response makes PanelCrypto.e() fail and the app shows the
// "Internet connection is required to verify app status" dialog before the
// login screen. Serving the expected JSON here lets the app continue to the
// license Check() call.
//
// The original server answers:
//   {"kill":0,"popup_msg":"","redirect_url":"","force_update":0,
//    "latest_ver":"1.0.0","apk_url":"","ts":<epoch>,"ok":1}
export function apkKillResponse() {
  const obj = {
    kill: 0,
    popup_msg: '',
    redirect_url: '',
    force_update: 0,
    latest_ver: '1.0.0',
    apk_url: '',
    ts: Math.floor(Date.now() / 1000),
    ok: 1,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= 0xa5;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function handleApkKill(request, db, env, ctx) {
  if (db) {
    try {
      const hit = db.prepare('INSERT INTO nexon_hits (panel_code,key_value,device_uuid,q,user_agent) VALUES (?,?,?,?,?)')
        .bind(String((env && env.PANEL_CODE) || 'YUVI_001'), 'APK_KILL', '', -1, String(request.headers.get('user-agent') || '').slice(0, 300))
        .run().catch(() => {});
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(hit);
    } catch {}
  }
  return new Response(apkKillResponse(), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
