// BGMI runtime-hook request sink.
// libbgmi.so ke CURLOPT_URL calls (Telegram sendMessage/sendPhoto + panel
// auth request) runtime hook se is Worker par aate hain. Yahan request log
// hoti hai aur Telegram-jaisa `{"ok":true}` reply diya jaata hai.

export async function handleBgmiLog(request, db, env, ctx) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  let size = 0;
  let body = '';
  try {
    const ab = await request.arrayBuffer();
    size = ab.byteLength;
    if (size > 0 && size <= 4 * 1024 * 1024) {
      body = new TextDecoder('utf-8', { fatal: false }).decode(ab);
    }
  } catch {}

  let chat = '';
  let text = '';
  try {
    let m = body.match(/name="chat_id"\s*\r?\n\r?\n([^\r\n]+)/);
    if (m) chat = m[1].trim().slice(0, 120);
    m = body.match(/name="text"\s*\r?\n\r?\n([\s\S]*?)\r?\n--/);
    if (m) text = m[1].trim().slice(0, 300);
    if (!text) {
      m = body.match(/name="caption"\s*\r?\n\r?\n([\s\S]*?)\r?\n--/);
      if (m) text = m[1].trim().slice(0, 300);
    }
  } catch {}

  const detail = [chat ? `chat=${chat}` : '', text].filter(Boolean).join(' | ');
  const ua = String(request.headers.get('user-agent') || '').slice(0, 300);

  // Existing diag (`/nexon-diag?action=hits`) isi table se padhta hai.
  const row = db.prepare(
    'INSERT INTO nexon_hits (panel_code,key_value,device_uuid,q,user_agent) VALUES (?,?,?,?,?)'
  ).bind(
    'BGMI_LOG',
    `${method} ${url.pathname}`.slice(0, 300),
    detail.slice(0, 300),
    size,
    ua
  ).run().catch(() => {});
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(row);
  else await row;

  return new Response(
    JSON.stringify({ ok: true, result: { message_id: 1, date: Math.floor(Date.now() / 1000) } }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    }
  );
}

// libbgmi.so license/auth heartbeat. Original host
// (nexoncheat.battleground-hub.shop) returns a random JS comment with 200,
// e.g. `/* v8.81 */`; client sirf status check karta hai. Same shape mirror
// karte hain, aur request diag table me log hoti hai.
export async function handleValidBool(request, db, env, ctx) {
  const url = new URL(request.url);

  let size = 0;
  let body = '';
  try {
    const ab = await request.arrayBuffer();
    size = ab.byteLength;
    if (size > 0 && size <= 64 * 1024) {
      body = new TextDecoder('utf-8', { fatal: false }).decode(ab);
    }
  } catch {}

  const q = [url.search.slice(0, 600), body.slice(0, 300)].filter(Boolean).join(' | ');
  const ua = String(request.headers.get('user-agent') || '').slice(0, 300);

  const row = db.prepare(
    'INSERT INTO nexon_hits (panel_code,key_value,device_uuid,q,user_agent) VALUES (?,?,?,?,?)'
  ).bind(
    'BGMI_VALID',
    `${request.method.toUpperCase()} ${url.pathname}`.slice(0, 300),
    q.slice(0, 300),
    size,
    ua
  ).run().catch(() => {});
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(row);
  else await row;

  return new Response('/* v3.65 */', {
    status: 200,
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
