// Vercel-path tests — the SAME panel driven through api/panel.js against a
// fake Cloudflare D1 REST endpoint (node:sqlite behind it, prod-shape JSON).
// Run:  node test/vercel-local.mjs   (Node >= 22.5)

import { DatabaseSync } from 'node:sqlite';

let passed = 0;
let failed = 0;
function ok(cond, name, extra) {
  if (cond) {
    passed += 1;
    console.log('  ok - ' + name);
  } else {
    failed += 1;
    console.error('  FAIL - ' + name + (extra ? ' :: ' + extra : ''));
  }
}

// ---------- fake Cloudflare D1 REST endpoint ----------
function makeCF() {
  const sqlite = new DatabaseSync(':memory:');
  const calls = [];
  const isRead = (sql, st) => {
    if (typeof st.columns === 'function') {
      try { return st.columns().length > 0; } catch { /* fall through */ }
    }
    return /^\s*(select|with|pragma)\b/i.test(String(sql));
  };
  return {
    sqlite,
    calls,
    fetch: async (url, init) => {
      calls.push({
        url: String(url),
        auth: init && init.headers && (init.headers.Authorization || init.headers.authorization),
      });
      let payload = {};
      try { payload = JSON.parse(init.body); } catch { /* keep {} */ }
      const sql = String(payload.sql || '');
      const params = payload.params || [];
      try {
        const st = sqlite.prepare(sql);
        const meta = { changes: 0, last_row_id: 0, rows_read: 0, rows_written: 0 };
        let results = [];
        if (isRead(sql, st)) {
          results = st.all(...params);
        } else {
          const info = st.run(...params);
          meta.changes = info.changes;
          meta.last_row_id = Number(info.lastInsertRowid);
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, errors: [], messages: [], result: [{ success: true, results, meta }] }),
        };
      } catch (e) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ success: false, errors: [{ code: 7500, message: String((e && e.message) || e) }], messages: [], result: null }),
        };
      }
    },
  };
}

const cf = makeCF();

// ---------- adapter (D1 REST shape) ----------
console.log('d1-rest adapter');
{
  const { d1RestDatabase } = await import('../src/backend/d1-rest.js');
  const db = d1RestDatabase({ accountId: 'acc-1', databaseId: 'db-1', token: 'tok-1', fetchImpl: cf.fetch });

  await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT);');
  const ins = await db.prepare('INSERT INTO t (v) VALUES (?)').bind('hello').run();
  ok(ins.meta.last_row_id === 1, 'run() returns last_row_id (router sessions ke liye)');
  const row = await db.prepare('SELECT v FROM t WHERE id=?').bind(1).first();
  ok(row && row.v === 'hello', 'first() with bind args');
  const cnt = await db.prepare('SELECT COUNT(*) n FROM t').all();
  ok(cnt.results && cnt.results[0].n === 1, 'all() returns { results }');
  const upd = await db.prepare('UPDATE t SET v=? WHERE id=?').bind('x', 1).run();
  ok(upd.meta.changes === 1, 'run() returns meta.changes');
  const noBind = await db.prepare('SELECT COUNT(*) n FROM t').first();
  ok(noBind && noBind.n === 1, 'prepare().first() without bind()');
  const rejected = await db.prepare('SELECT * FROM nope').first().then(() => false).catch(() => true);
  ok(rejected, 'SQL error reject karta hai (real D1 jaisa)');

  await db.exec('CREATE TABLE a1 (id INTEGER);\nCREATE TABLE b1 (id INTEGER);');
  const tabs = await db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN ('a1','b1')").first();
  ok(tabs.n === 2, 'exec() multi-statement SQL split karta hai');

  ok(cf.calls[0].url === 'https://api.cloudflare.com/client/v4/accounts/acc-1/d1/database/db-1/query', 'REST endpoint URL sahi');
  ok(cf.calls[0].auth === 'Bearer tok-1', 'Authorization: Bearer token');
}

// ---------- full panel through the Vercel handler ----------
process.env.CF_ACCOUNT_ID = 'acc-1';
process.env.CF_D1_DATABASE_ID = 'db-1';
process.env.CF_D1_API_TOKEN = 'tok-1';
process.env.PANEL_CODE = 'YUVI_001';
process.env.PANEL_NAME = 'VERCEL PANEL';

const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => cf.fetch(url, init);
const { default: handler } = await import('../api/panel.js');

function mockReq(method, url, headers, body) {
  const chunks = body === undefined ? [] : [Buffer.isBuffer(body) ? body : Buffer.from(body)];
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() { for (const c of chunks) yield c; },
  };
}
function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: Buffer.alloc(0),
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    end(b) { this.body = Buffer.isBuffer(b) ? b : Buffer.from(b || ''); },
  };
}
async function call(method, url, { headers = {}, body } = {}) {
  const req = mockReq(method, url, { host: 'panel.vercel.app', 'x-forwarded-proto': 'https', ...headers }, body);
  const res = mockRes();
  await handler(req, res);
  return res;
}

console.log('panel via vercel handler');
{
  let r = await call('GET', '/dashboard');
  ok(r.statusCode === 302 && r.headers.location === '/setup', 'khali DB -> /setup redirect', r.statusCode + ' ' + r.headers.location);

  const form = new URLSearchParams({ username: 'boss', password: 'secret123' }).toString();
  r = await call('POST', '/setup', { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  ok(r.statusCode === 302 && r.headers.location === '/dashboard', 'POST /setup owner banata hai', r.statusCode + ' ' + r.headers.location);

  const rawCookie = r.headers['set-cookie'];
  const cookieStr = Array.isArray(rawCookie) ? rawCookie[0] : rawCookie;
  ok(!!cookieStr && /sdk_session=/.test(String(cookieStr)), 'Set-Cookie response me forward hota hai');
  const cookie = 'sdk_session=' + /sdk_session=([^;]+)/.exec(String(cookieStr))[1];

  r = await call('GET', '/dashboard', { headers: { cookie } });
  ok(r.statusCode === 200 && String(r.headers['content-type'] || '').includes('text/html'), 'dashboard 200 html (session ke saath)');
  ok(r.body.length > 500, 'dashboard body render hua');

  r = await call('GET', '/login');
  ok(r.statusCode === 200 && r.body.length > 100, '/login render hota hai');

  r = await call('GET', '/connect/YUVI_001');
  ok(r.statusCode === 405 || r.statusCode === 400 || r.statusCode === 200, '/connect route live hai (method guard ke saath)');
}

globalThis.fetch = realFetch;

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
