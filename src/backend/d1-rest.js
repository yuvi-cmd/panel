// Cloudflare D1 over the REST API — for runtimes without a native D1
// binding (the Vercel deploy in /api/panel.js).
//
// Same shape the panel already uses from a real binding:
//   db.prepare(sql).bind(...).first() / .all() / .run()
//   db.prepare(sql).first() / .all() / .run()
//   db.exec(multiStatementSql)
// Errors reject (like real D1); run() resolves { meta: { last_row_id, changes } }.

const D1_URL = 'https://api.cloudflare.com/client/v4/accounts/';

function splitStatements(sql) {
  const out = [];
  let cur = '';
  let inStr = false;
  for (const ch of String(sql)) {
    if (ch === "'") inStr = !inStr;
    if (ch === ';' && !inStr) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function d1RestDatabase({ accountId, databaseId, token, fetchImpl }) {
  if (!accountId || !databaseId || !token) {
    throw new Error('d1RestDatabase: accountId, databaseId, token required');
  }
  const doFetch = fetchImpl || fetch;
  const endpoint = D1_URL + encodeURIComponent(accountId) + '/d1/database/' + encodeURIComponent(databaseId) + '/query';

  async function query(sql, params) {
    const res = await doFetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params: params || [] }),
    });
    let data = null;
    try { data = await res.json(); } catch { throw new Error('D1 REST: non-JSON response (HTTP ' + res.status + ')'); }
    if (!res.ok || !data || data.success !== true) {
      const msg = (data && Array.isArray(data.errors) && data.errors.length)
        ? data.errors.map((e) => (e && e.message) || JSON.stringify(e)).join('; ')
        : 'HTTP ' + res.status;
      throw new Error('D1 REST: ' + msg);
    }
    const first = Array.isArray(data.result) ? data.result[0] : data.result;
    return (first && typeof first === 'object') ? first : { results: [], meta: {} };
  }

  function wrap(sql, params) {
    return {
      async first() {
        const r = await query(sql, params);
        return (r.results && r.results[0]) || null;
      },
      async all() {
        const r = await query(sql, params);
        return { results: r.results || [], meta: r.meta || {} };
      },
      async run() {
        const r = await query(sql, params);
        return { meta: r.meta || {} };
      },
    };
  }

  return {
    prepare(sql) {
      return {
        bind: (...args) => wrap(sql, args),
        first: () => wrap(sql, []).first(),
        all: () => wrap(sql, []).all(),
        run: () => wrap(sql, []).run(),
      };
    },
    async exec(sql) {
      for (const stmt of splitStatements(sql)) await query(stmt, []);
    },
  };
}
