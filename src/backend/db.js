// D1 bootstrap. The first request per isolate installs the idempotent schema
// and default settings. schema.sql and src/backend/schema.js are kept in sync
// by scripts/sync-schema.mjs.

import { SCHEMA } from './schema.js';
import { nowS } from './crypto.js';

export const DEFAULT_SETTINGS = {
  server_enabled: '1',
  maintenance_message: 'Activation server is temporarily offline for maintenance.',
  session_ttl: '3600',
  heartbeat_interval: '300',
  challenge_ttl: '60',
  clock_skew: '300',
  authorization_ttl: '120',
  guest_proof_required: '1',
  announcement: '',
  server_version: '1.0.0',
};

export async function ensureDB(db) {
  if (globalThis.__makDbReady) return;
  await db.exec(SCHEMA);
  const now = nowS();
  const stmts = Object.entries(DEFAULT_SETTINGS).map(([key, value]) =>
    db.prepare('INSERT OR IGNORE INTO mak_settings (key,value,updated_at) VALUES (?,?,?)').bind(key, value, now),
  );
  if (stmts.length) await db.batch(stmts);
  // Opportunistic cleanup. Cheap, bounded, and never touches live licenses.
  try {
    await db.prepare('DELETE FROM mak_challenges WHERE expires_at < ?').bind(now - 3600).run();
    await db.prepare('DELETE FROM mak_admin_sessions WHERE expires_at < ?').bind(now - 86400).run();
  } catch {
    // Cleanup is best-effort only.
  }
  globalThis.__makDbReady = true;
}

export async function getSettings(db) {
  const rows = await db.prepare('SELECT key,value FROM mak_settings').all()
    .then((r) => r.results || [])
    .catch(() => []);
  const values = { ...DEFAULT_SETTINGS };
  for (const row of rows) values[row.key] = row.value;
  return {
    server_enabled: values.server_enabled === '1',
    maintenance_message: values.maintenance_message || DEFAULT_SETTINGS.maintenance_message,
    session_ttl: parseInt(values.session_ttl, 10) || 3600,
    heartbeat_interval: parseInt(values.heartbeat_interval, 10) || 300,
    challenge_ttl: parseInt(values.challenge_ttl, 10) || 60,
    clock_skew: parseInt(values.clock_skew, 10) || 300,
    authorization_ttl: parseInt(values.authorization_ttl, 10) || 120,
    guest_proof_required: values.guest_proof_required === '1',
    announcement: values.announcement || '',
    server_version: values.server_version || '1.0.0',
    raw: values,
  };
}

export async function setSetting(db, key, value) {
  await db.prepare(
    'INSERT INTO mak_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
  ).bind(key, String(value), nowS()).run();
}

export async function setSettings(db, entries) {
  const now = nowS();
  const stmts = Object.entries(entries).map(([key, value]) =>
    db.prepare(
      'INSERT INTO mak_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
    ).bind(key, String(value), now),
  );
  if (stmts.length) await db.batch(stmts);
}

export async function tableExists(db, name) {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(name).first().catch(() => null);
  return !!row;
}

export { SCHEMA };
