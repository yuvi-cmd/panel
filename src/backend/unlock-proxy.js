// Transparent proxy for the loader's download/session endpoint.
//
// libshaitaan.so's Downtwo.UnlockUrl() originally pointed at
//   https://nexoncheat.battleground-hub.shop/secure/unlock
// The app POSTs an encrypted payload there, receives an encrypted response
// (which contains the real download link) and only then downloads the zip.
//
// After moving login/status to the Worker the native URL builder also moved
// UnlockUrl to the Worker, where this endpoint did not exist, so the loader
// stopped before downloading. Forwarding the request to the original host
// keeps the download behaviour byte-for-byte identical while login and the
// status check keep using the new panel.
const OLD_UNLOCK = 'https://nexoncheat.battleground-hub.shop/secure/unlock';
const OLD_ORIGIN = 'https://nexoncheat.battleground-hub.shop';

export async function handleUnlockProxy(request, db, env, ctx) {
  const method = request.method.toUpperCase();
  let body = null;
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      body = await request.arrayBuffer();
    } catch {
      body = null;
    }
  }

  const headers = new Headers();
  const ct = request.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  headers.set('accept', request.headers.get('accept') || '*/*');
  headers.set(
    'user-agent',
    request.headers.get('user-agent') || 'Dalvik/2.1.0 (Linux; U; Android)'
  );
  // The old host validates the request origin; the app now sends the Worker
  // origin because the same host string is shared with the login URL.
  headers.set('origin', OLD_ORIGIN);
  headers.set('referer', OLD_ORIGIN + '/');

  if (db) {
    try {
      const hit = db
        .prepare(
          'INSERT INTO nexon_hits (panel_code,key_value,device_uuid,q,user_agent) VALUES (?,?,?,?,?)'
        )
        .bind(
          String((env && env.PANEL_CODE) || 'YUVI_001'),
          'UNLOCK',
          '',
          -2,
          String(request.headers.get('user-agent') || '').slice(0, 300)
        )
        .run()
        .catch(() => {});
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(hit);
    } catch {}
  }

  let upstream;
  try {
    upstream = await fetch(OLD_UNLOCK, {
      method,
      headers,
      body: body && body.byteLength ? body : undefined,
      redirect: 'manual',
    });
  } catch (e) {
    return new Response('/* unlock proxy upstream error */', {
      status: 502,
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const out = new Headers();
  out.set(
    'Content-Type',
    upstream.headers.get('content-type') || 'text/plain;charset=UTF-8'
  );
  out.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  out.set('Pragma', 'no-cache');
  out.set('Access-Control-Allow-Origin', '*');

  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: out,
  });
}
