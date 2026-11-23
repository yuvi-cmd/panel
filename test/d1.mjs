// Minimal D1-compatible adapter over Node's built-in SQLite, used only by tests.
// Cloudflare D1 and node:sqlite share the same SQL dialect for everything this
// project uses; this adapter maps prepare/bind/first/all/run/batch/exec.

import { DatabaseSync } from 'node:sqlite';

class BoundStatement {
  constructor(adapter, sql, args) {
    this.adapter = adapter;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    return new BoundStatement(this.adapter, this.sql, args);
  }

  async first(column) {
    const row = this.adapter.raw.prepare(this.sql).get(...this.args);
    if (!row) return null;
    if (column) return row[column] ?? null;
    return { ...row };
  }

  async all() {
    const rows = this.adapter.raw.prepare(this.sql).all(...this.args);
    return { success: true, results: rows.map((r) => ({ ...r })), meta: {} };
  }

  async run() {
    const res = this.adapter.raw.prepare(this.sql).run(...this.args);
    return {
      success: true,
      results: [],
      meta: { changes: Number(res.changes || 0), last_row_id: Number(res.lastInsertRowid || 0) },
    };
  }
}

export class MemoryD1 {
  constructor() {
    this.raw = new DatabaseSync(':memory:');
  }

  prepare(sql) {
    return new BoundStatement(this, sql, []);
  }

  async exec(sql) {
    this.raw.exec(sql);
    return { count: 0, duration: 0 };
  }

  async batch(statements) {
    const out = [];
    for (const statement of statements) out.push(await statement.run());
    return out;
  }
}
