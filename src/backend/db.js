// Database layer — full schema + idempotent migrations.
// SCHEMA uses CREATE TABLE IF NOT EXISTS and MIGRATE_COLS are no-op ALTERs
// on current databases, so this is safe to run per isolate (see ensureDB).

import { SCHEMA as MAK_SCHEMA } from '../mak/schema.js';
import { installDefaultSettings } from '../mak/settings.js';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL DEFAULT '', username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'RESELLER', invited_by INTEGER, balance INTEGER NOT NULL DEFAULT 0, referral_limit INTEGER NOT NULL DEFAULT 0, can_generate_referral INTEGER NOT NULL DEFAULT 1, validity TEXT, panel_code TEXT NOT NULL DEFAULT 'YUVI_001', is_blocked INTEGER NOT NULL DEFAULT 0, panel_expiry TEXT, device_fingerprint TEXT, last_login TEXT, last_reset TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_users_panel ON users(panel_code);
CREATE TABLE IF NOT EXISTS panels (panel_code TEXT PRIMARY KEY, duration INTEGER NOT NULL DEFAULT 30, expires_at TEXT, is_active INTEGER NOT NULL DEFAULT 1, encryption_subscription INTEGER NOT NULL DEFAULT 0, tg_subscription INTEGER NOT NULL DEFAULT 0, admin_role INTEGER NOT NULL DEFAULT 0, reseller_role INTEGER NOT NULL DEFAULT 0, account_limit INTEGER NOT NULL DEFAULT 0, auto_join INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, key_value TEXT NOT NULL, duration TEXT NOT NULL DEFAULT '30D', device_limit INTEGER NOT NULL DEFAULT 1, uses INTEGER NOT NULL DEFAULT 0, expires_at TEXT, panel_code TEXT NOT NULL DEFAULT 'YUVI_001', is_active INTEGER NOT NULL DEFAULT 1, is_blocked INTEGER NOT NULL DEFAULT 0, created_by INTEGER NOT NULL DEFAULT 1, server_type TEXT NOT NULL DEFAULT 'PRIVATE', UNIQUE(key_value, panel_code));
CREATE INDEX IF NOT EXISTS idx_api_panel ON api_keys(panel_code);
CREATE INDEX IF NOT EXISTS idx_api_created ON api_keys(created_by);
CREATE TABLE IF NOT EXISTS key_devices (key_id INTEGER NOT NULL, device_uuid TEXT NOT NULL, panel_code TEXT NOT NULL DEFAULT 'YUVI_001', last_seen TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (key_id, device_uuid));
CREATE TABLE IF NOT EXISTS mod_settings (setting_name TEXT NOT NULL, setting_value TEXT, panel_code TEXT NOT NULL DEFAULT 'YUVI_001', PRIMARY KEY (setting_name, panel_code));
CREATE TABLE IF NOT EXISTS mod_maintenance (panel_code TEXT PRIMARY KEY, is_active INTEGER NOT NULL DEFAULT 0, reason TEXT);
CREATE TABLE IF NOT EXISTS loader_config (id INTEGER PRIMARY KEY AUTOINCREMENT, panel_code TEXT NOT NULL UNIQUE, version REAL NOT NULL DEFAULT 1.0, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS loader_files (id INTEGER PRIMARY KEY AUTOINCREMENT, panel_code TEXT NOT NULL, file_name TEXT NOT NULL, file_path TEXT NOT NULL, server_type TEXT NOT NULL DEFAULT 'PRIVATE', uploaded_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS mod_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, panel_code TEXT NOT NULL, name TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(panel_code, name));
CREATE TABLE IF NOT EXISTS mod_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, panel_code TEXT NOT NULL, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(panel_code, name));
CREATE TABLE IF NOT EXISTS referrals (code TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'RESELLER', duration INTEGER NOT NULL DEFAULT 30, balance INTEGER NOT NULL DEFAULT 0, panel_code TEXT NOT NULL DEFAULT 'YUVI_001', created_by INTEGER, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS activation_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, activation_key TEXT NOT NULL UNIQUE, panel_code TEXT NOT NULL DEFAULT 'YUVI_001', name TEXT, duration_months INTEGER NOT NULL DEFAULT 1, expires_at TEXT NOT NULL, is_used INTEGER NOT NULL DEFAULT 0, used_by TEXT, used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS mod_loaders (id INTEGER PRIMARY KEY AUTOINCREMENT, panel_code TEXT NOT NULL DEFAULT 'YUVI_001', app_name TEXT NOT NULL DEFAULT '', package_name TEXT NOT NULL DEFAULT '', sha256 TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '', is_blocked INTEGER NOT NULL DEFAULT 0, expires_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), request_count INTEGER NOT NULL DEFAULT 0, last_ping TEXT, is_binded INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sdk_hash_vault (id INTEGER PRIMARY KEY AUTOINCREMENT, panel_code TEXT NOT NULL DEFAULT 'YUVI_001', engine TEXT NOT NULL DEFAULT 'GENERAL', hash_type TEXT NOT NULL DEFAULT 'lib_signature', hash_label TEXT NOT NULL, hash_value TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);
`;

export const INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_dev_panel ON key_devices(panel_code);
CREATE INDEX IF NOT EXISTS idx_loader_panel ON loader_files(panel_code);
CREATE INDEX IF NOT EXISTS idx_sess_user ON sessions(user_id);
`;

export const MIGRATE_COLS = [
  ['users', 'full_name', "TEXT NOT NULL DEFAULT ''"], ['users', 'invited_by', 'INTEGER'],
  ['users', 'balance', 'INTEGER NOT NULL DEFAULT 0'], ['users', 'referral_limit', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'can_generate_referral', 'INTEGER NOT NULL DEFAULT 1'], ['users', 'validity', 'TEXT'],
  ['users', 'is_blocked', 'INTEGER NOT NULL DEFAULT 0'], ['users', 'panel_expiry', 'TEXT'],
  ['users', 'device_fingerprint', 'TEXT'], ['users', 'last_login', 'TEXT'], ['users', 'last_reset', 'TEXT'],
  ['panels', 'duration', 'INTEGER NOT NULL DEFAULT 30'], ['panels', 'expires_at', 'TEXT'],
  ['panels', 'encryption_subscription', 'INTEGER NOT NULL DEFAULT 0'], ['panels', 'tg_subscription', 'INTEGER NOT NULL DEFAULT 0'],
  ['panels', 'admin_role', 'INTEGER NOT NULL DEFAULT 0'], ['panels', 'reseller_role', 'INTEGER NOT NULL DEFAULT 0'],
  ['api_keys', 'server_type', "TEXT NOT NULL DEFAULT 'PRIVATE'"],
  // Full hot-path coverage: old databases (pre-column) otherwise throw on
  // device-bind writes AFTER a real key is found -> HTTP 500 SERVER ERROR.
  // Each ALTER is a no-op when the column already exists.
  ['users', 'username', 'TEXT'], ['users', 'password_hash', 'TEXT'], ['users', 'role', 'TEXT'],
  ['users', 'panel_code', 'TEXT'], ['users', 'created_at', 'TEXT'],
  ['panels', 'is_active', 'INTEGER NOT NULL DEFAULT 1'],
  ['panels', 'account_limit', 'INTEGER NOT NULL DEFAULT 0'], ['panels', 'auto_join', 'INTEGER NOT NULL DEFAULT 0'],
  ['api_keys', 'key_value', 'TEXT'], ['api_keys', 'duration', 'TEXT'],
  ['api_keys', 'device_limit', 'INTEGER NOT NULL DEFAULT 1'], ['api_keys', 'uses', 'INTEGER NOT NULL DEFAULT 0'],
  ['api_keys', 'expires_at', 'TEXT'], ['api_keys', 'panel_code', 'TEXT'],
  ['api_keys', 'is_active', 'INTEGER NOT NULL DEFAULT 1'], ['api_keys', 'is_blocked', 'INTEGER NOT NULL DEFAULT 0'],
  ['api_keys', 'created_by', 'INTEGER NOT NULL DEFAULT 1'],
  ['key_devices', 'key_id', 'INTEGER'], ['key_devices', 'device_uuid', 'TEXT'],
  ['key_devices', 'panel_code', 'TEXT'], ['key_devices', 'last_seen', 'TEXT'],
];

// Split a SQL script into complete statements. D1's exec() treats input as
// newline-separated statements, which breaks multi-line DDL; batching complete
// statements avoids that. Handles -- comments and single/double quoted strings.
export function splitSqlStatements(sql) {
  const out = [];
  let current = '';
  let single = false;
  let double = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!single && !double && ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      current += '\n';
      continue;
    }
    if (ch === "'" && !double) {
      if (single && sql[i + 1] === "'") { current += "''"; i++; continue; }
      single = !single;
      current += ch;
      continue;
    }
    if (ch === '"' && !single) { double = !double; current += ch; continue; }
    if (ch === ';' && !single && !double) {
      if (current.trim()) out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

async function runStatements(db, sql) {
  const statements = splitSqlStatements(sql);
  if (!statements.length) return;
  if (typeof db.batch === 'function') {
    try {
      await db.batch(statements.map((statement) => db.prepare(statement)));
      return;
    } catch (err) {
      console.error('schema_batch_failed', String(err));
    }
  }
  for (const statement of statements) {
    try { await db.prepare(statement).run(); } catch { /* idempotent schema: keep going */ }
  }
}

// ---------------------------------------------------------------------------
// MAK migrations. D1/SQLite cannot drop a UNIQUE constraint in place, so the
// two tables that gained a wider uniqueness key are rebuilt once. Every step
// is idempotent: it inspects sqlite_master / PRAGMA table_info first.
// ---------------------------------------------------------------------------
async function makTableSql(db, name) {
  const row = await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
    .bind(String(name)).first().catch(() => null);
  return row ? String(row.sql || '') : '';
}

async function makColumnExists(db, table, column) {
  const rows = await db.prepare(`PRAGMA table_info(${table})`).all().catch(() => ({ results: [] }));
  return (rows.results || []).some((r) => String(r.name) === String(column));
}

async function addMakColumn(db, table, column, definition) {
  if (await makColumnExists(db, table, column)) return;
  try { await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run(); }
  catch (err) { console.error('mak_alter_failed', table + '.' + column, String(err)); }
}

async function rebuildMakHosts(db) {
  const hasAppName = await makColumnExists(db, 'mak_hosts', 'app_name');
  const hasLastSeen = await makColumnExists(db, 'mak_hosts', 'last_seen');
  await db.prepare('DROP TABLE IF EXISTS mak_hosts_migrate').run();
  await db.prepare(`CREATE TABLE mak_hosts_migrate (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id INTEGER NOT NULL,
    package_name TEXT NOT NULL,
    app_name TEXT NOT NULL DEFAULT '',
    cert_sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    version_policy TEXT NOT NULL DEFAULT 'ANY',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_seen INTEGER,
    UNIQUE(license_id, package_name)
  )`).run();
  await db.prepare(
    `INSERT INTO mak_hosts_migrate
      (id,license_id,package_name,app_name,cert_sha256,status,version_policy,created_at,updated_at,last_seen)
     SELECT id,license_id,package_name,${hasAppName ? 'app_name' : "''"},cert_sha256,status,version_policy,created_at,updated_at,${hasLastSeen ? 'last_seen' : 'NULL'}
       FROM mak_hosts`,
  ).run();
  await db.prepare('DROP TABLE mak_hosts').run();
  await db.prepare('ALTER TABLE mak_hosts_migrate RENAME TO mak_hosts').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_mak_hosts_license ON mak_hosts(license_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_mak_hosts_package ON mak_hosts(package_name)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_mak_hosts_status ON mak_hosts(status)').run();
}

async function rebuildMakBindings(db) {
  await db.prepare('DROP TABLE IF EXISTS mak_bindings_migrate').run();
  await db.prepare(`CREATE TABLE mak_bindings_migrate (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id INTEGER NOT NULL,
    host_id INTEGER NOT NULL DEFAULT 0,
    guest_app_id INTEGER NOT NULL,
    can_install INTEGER NOT NULL DEFAULT 1,
    can_launch INTEGER NOT NULL DEFAULT 1,
    can_update INTEGER NOT NULL DEFAULT 1,
    can_restart INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(license_id, host_id, guest_app_id)
  )`).run();
  await db.prepare(
    `INSERT INTO mak_bindings_migrate
      (id,license_id,host_id,guest_app_id,can_install,can_launch,can_update,can_restart,status,created_at,updated_at)
     SELECT id,license_id,0,guest_app_id,can_install,can_launch,can_update,can_restart,status,created_at,updated_at
       FROM mak_bindings`,
  ).run();
  await db.prepare('DROP TABLE mak_bindings').run();
  await db.prepare('ALTER TABLE mak_bindings_migrate RENAME TO mak_bindings').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_mak_bindings_license ON mak_bindings(license_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_mak_bindings_host ON mak_bindings(license_id, host_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_mak_bindings_guest ON mak_bindings(guest_app_id)').run();
}

async function migrateMakSchema(db) {
  // New policy columns.
  await addMakColumn(db, 'mak_licenses', 'max_packages', 'INTEGER NOT NULL DEFAULT 1');
  await addMakColumn(db, 'mak_licenses', 'max_apps', 'INTEGER NOT NULL DEFAULT 2');
  await addMakColumn(db, 'mak_devices', 'device_id', "TEXT NOT NULL DEFAULT ''");
  await addMakColumn(db, 'mak_devices', 'device_id_first', "TEXT NOT NULL DEFAULT ''");
  await addMakColumn(db, 'mak_events', 'device_uid', "TEXT NOT NULL DEFAULT ''");

  // Old bind modes become the new AUTO/MANUAL vocabulary.
  await db.prepare("UPDATE mak_licenses SET host_bind_mode='AUTO' WHERE host_bind_mode='FIRST_USE'").run().catch(() => {});
  await db.prepare("UPDATE mak_licenses SET host_bind_mode='MANUAL' WHERE host_bind_mode='STRICT'").run().catch(() => {});
  await db.prepare("UPDATE mak_licenses SET host_bind_mode='AUTO' WHERE host_bind_mode IS NULL OR host_bind_mode=''").run().catch(() => {});

  const hostSql = await makTableSql(db, 'mak_hosts');
  if (hostSql && (/UNIQUE\s*\(\s*license_id\s*\)/i.test(hostSql) || !(await makColumnExists(db, 'mak_hosts', 'app_name')))) {
    await rebuildMakHosts(db);
  }

  if (!(await makColumnExists(db, 'mak_bindings', 'host_id'))) {
    await rebuildMakBindings(db);
  }
}

export async function ensureDB(db, panelCode) {
  // Don't run the full schema + ALTER migration on every request. D1 persists;
  // one successful ensure per isolate is enough until redeploy.
  if (globalThis.__arcDbReady === panelCode) return;

  // Core panel schema plus the MAK control-plane tables. Both are idempotent.
  await runStatements(db, SCHEMA);
  await runStatements(db, MAK_SCHEMA);
  await migrateMakSchema(db).catch((err) => console.error('mak_migration_failed', String(err)));
  await installDefaultSettings(db).catch((err) => console.error('mak_settings_failed', String(err)));

  for (const [t, c, def] of MIGRATE_COLS) {
    try { await db.prepare('ALTER TABLE ' + t + ' ADD COLUMN ' + c + ' ' + def).run(); } catch {}
  }
  // Indexes last: they reference columns that legacy DBs only gain above.
  await runStatements(db, INDEX_SQL);
  try { await db.prepare('INSERT OR IGNORE INTO panels (panel_code, is_active) VALUES (?,1)').bind(panelCode).run(); } catch {}
  // v1.3: main owner (id 1) is THE single PROFESSOR. Legacy installs that
  // created id 1 as OWNER are upgraded in place (idempotent).
  try { await db.prepare("UPDATE users SET role='PROFESSOR' WHERE id=1 AND role='OWNER'").run(); } catch {}
  // Expired/consumed MAK challenges are safe to drop; live licenses untouched.
  try {
    await db.prepare('DELETE FROM mak_challenges WHERE expires_at < ?').bind(Math.floor(Date.now() / 1000) - 3600).run();
  } catch {}
  globalThis.__arcDbReady = panelCode;
}
