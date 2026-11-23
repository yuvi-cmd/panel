-- FULL Panel (Cloudflare D1 / SQLite) schema — panel-glass.zip ka poora port
-- Fresh install: wrangler d1 execute sdk --file=schema.sql
-- (Purane sdk-only DB par bhi safe: CREATE TABLE IF NOT EXISTS + Worker startup par ALTER COLUMN migration)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL DEFAULT '',
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'RESELLER',
  invited_by INTEGER,
  balance INTEGER NOT NULL DEFAULT 0,
  referral_limit INTEGER NOT NULL DEFAULT 0,
  can_generate_referral INTEGER NOT NULL DEFAULT 1,
  validity TEXT,
  panel_code TEXT NOT NULL DEFAULT 'YUVI_001',
  is_blocked INTEGER NOT NULL DEFAULT 0,
  panel_expiry TEXT,
  device_fingerprint TEXT,
  last_login TEXT,
  last_reset TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_panel ON users(panel_code);

CREATE TABLE IF NOT EXISTS panels (
  panel_code TEXT PRIMARY KEY,
  duration INTEGER NOT NULL DEFAULT 30,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  encryption_subscription INTEGER NOT NULL DEFAULT 0,
  tg_subscription INTEGER NOT NULL DEFAULT 0,
  admin_role INTEGER NOT NULL DEFAULT 0,
  reseller_role INTEGER NOT NULL DEFAULT 0,
  account_limit INTEGER NOT NULL DEFAULT 0,
  auto_join INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_value TEXT NOT NULL,
  duration TEXT NOT NULL DEFAULT '30D',
  device_limit INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  panel_code TEXT NOT NULL DEFAULT 'YUVI_001',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL DEFAULT 1,
  server_type TEXT NOT NULL DEFAULT 'PRIVATE',
  UNIQUE(key_value, panel_code)
);
CREATE INDEX IF NOT EXISTS idx_api_panel ON api_keys(panel_code);
CREATE INDEX IF NOT EXISTS idx_api_created ON api_keys(created_by);

CREATE TABLE IF NOT EXISTS key_devices (
  key_id INTEGER NOT NULL,
  device_uuid TEXT NOT NULL,
  panel_code TEXT NOT NULL DEFAULT 'YUVI_001',
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (key_id, device_uuid)
);
CREATE INDEX IF NOT EXISTS idx_dev_panel ON key_devices(panel_code);

CREATE TABLE IF NOT EXISTS mod_settings (
  setting_name TEXT NOT NULL,
  setting_value TEXT,
  panel_code TEXT NOT NULL DEFAULT 'YUVI_001',
  PRIMARY KEY (setting_name, panel_code)
);

CREATE TABLE IF NOT EXISTS mod_maintenance (
  panel_code TEXT PRIMARY KEY,
  is_active INTEGER NOT NULL DEFAULT 0,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS loader_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel_code TEXT NOT NULL UNIQUE,
  version REAL NOT NULL DEFAULT 1.0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loader_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel_code TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  server_type TEXT NOT NULL DEFAULT 'PRIVATE',
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loader_panel ON loader_files(panel_code);

CREATE TABLE IF NOT EXISTS mod_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel_code TEXT NOT NULL,
  name TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(panel_code, name)
);

CREATE TABLE IF NOT EXISTS mod_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel_code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(panel_code, name)
);


CREATE TABLE IF NOT EXISTS referrals (
  code TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'RESELLER',
  duration INTEGER NOT NULL DEFAULT 30,
  balance INTEGER NOT NULL DEFAULT 0,
  panel_code TEXT NOT NULL DEFAULT 'YUVI_001',
  created_by INTEGER,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS activation_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activation_key TEXT NOT NULL UNIQUE,
  panel_code TEXT NOT NULL DEFAULT 'YUVI_001',
  name TEXT,
  duration_months INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL,
  is_used INTEGER NOT NULL DEFAULT 0,
  used_by TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mod_loaders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel_code TEXT NOT NULL DEFAULT 'YUVI_001',
  app_name TEXT NOT NULL DEFAULT '',
  package_name TEXT NOT NULL DEFAULT '',
  sha256 TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  is_blocked INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  request_count INTEGER NOT NULL DEFAULT 0,
  last_ping TEXT,
  is_binded INTEGER NOT NULL DEFAULT 0
);

-- ===== SDK tables (already live, yahi rehni chahiye) =====




CREATE TABLE IF NOT EXISTS sdk_hash_vault (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panel_code TEXT NOT NULL DEFAULT 'YUVI_001',
  engine TEXT NOT NULL DEFAULT 'GENERAL',
  hash_type TEXT NOT NULL DEFAULT 'lib_signature',
  hash_label TEXT NOT NULL,
  hash_value TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);


CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sess_user ON sessions(user_id);

-- ===== OpenCode Android app (login / activation / remote switch) =====
CREATE TABLE IF NOT EXISTS opencode_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT '',
  device_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT,
  last_login TEXT,
  last_seen TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_opencode_status ON opencode_users(status);
CREATE INDEX IF NOT EXISTS idx_opencode_seen ON opencode_users(last_seen);

CREATE TABLE IF NOT EXISTS opencode_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  device_id TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_opencode_sess_user ON opencode_sessions(user_id);

CREATE TABLE IF NOT EXISTS opencode_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opencode_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS opencode_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  kind TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_opencode_events ON opencode_events(created_at);

-- Standalone /opencode admin sessions (separate from SDK `sessions`).
CREATE TABLE IF NOT EXISTS opencode_admin_sessions (
  token_hash TEXT PRIMARY KEY,
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opencode_admin_exp ON opencode_admin_sessions(expires_at);

INSERT OR IGNORE INTO opencode_settings (key,value) VALUES ('global_enabled','1');
INSERT OR IGNORE INTO opencode_settings (key,value) VALUES ('maintenance_message','');
INSERT OR IGNORE INTO opencode_settings (key,value) VALUES ('support_url','');
INSERT OR IGNORE INTO opencode_settings (key,value) VALUES ('min_version_code','1');
-- Default OpenCode app API transport passphrase (SHA-256 derived at runtime).
-- Override with 64 hex (raw key) or any passphrase via:
--   INSERT OR REPLACE INTO opencode_settings (key,value) VALUES ('opencode_enc_key','...');
INSERT OR IGNORE INTO opencode_settings (key,value) VALUES ('opencode_enc_key','YUVISDK88702026BASE64');

-- ===========================================================================
-- MAK/1 control plane (added to the existing SDK Panel schema)
-- ===========================================================================
-- MUNDO ACTIVATION KEY (MAK/1) — Cloudflare D1 schema
-- Fresh install:
--   npx wrangler d1 execute panel --file=schema.sql
-- The Worker also runs this idempotently on first request per isolate.
-- Timestamps are Unix seconds (INTEGER), matching the MAK/1 wire protocol.

-- ---------------------------------------------------------------------------
-- Panel administrators + sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'OWNER',
  created_at    INTEGER NOT NULL,
  last_login    INTEGER
);

CREATE TABLE IF NOT EXISTS mak_admin_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT NOT NULL UNIQUE,
  admin_id    INTEGER NOT NULL,
  csrf        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  last_seen   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mak_admin_sessions_admin ON mak_admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_mak_admin_sessions_expiry ON mak_admin_sessions(expires_at);

-- ---------------------------------------------------------------------------
-- Runtime settings (server on/off, protocol timings, maintenance copy)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Licenses (MAK credentials). Only a SHA-256 verifier is stored.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_licenses (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  license_uid      TEXT NOT NULL UNIQUE,
  label            TEXT NOT NULL DEFAULT '',
  user_ref         TEXT NOT NULL DEFAULT '',
  credential_hash  TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | SUSPENDED | REVOKED
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  expires_at       INTEGER,
  max_devices      INTEGER NOT NULL DEFAULT 1,
  max_activations  INTEGER NOT NULL DEFAULT 1,
  activation_count INTEGER NOT NULL DEFAULT 0,
  session_ttl      INTEGER NOT NULL DEFAULT 3600,
  max_packages     INTEGER NOT NULL DEFAULT 1, -- host APK package names this MAK may bind
  max_apps         INTEGER NOT NULL DEFAULT 2, -- guest apps allowed PER host package
  host_bind_mode   TEXT NOT NULL DEFAULT 'AUTO', -- AUTO | MANUAL
  notes            TEXT NOT NULL DEFAULT '',
  created_by       INTEGER,
  last_used_at     INTEGER,
  rotated_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mak_licenses_status ON mak_licenses(status);
CREATE INDEX IF NOT EXISTS idx_mak_licenses_expiry ON mak_licenses(expires_at);

-- ---------------------------------------------------------------------------
-- Host APK bindings: one row per host package (up to max_packages per license)
-- AUTO mode binds a new package on first authenticated use; MANUAL mode only
-- accepts packages an administrator registered in advance.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_hosts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id    INTEGER NOT NULL,
  package_name  TEXT NOT NULL,
  app_name      TEXT NOT NULL DEFAULT '',
  cert_sha256   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  version_policy TEXT NOT NULL DEFAULT 'ANY',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_seen     INTEGER,
  UNIQUE(license_id, package_name)
);
CREATE INDEX IF NOT EXISTS idx_mak_hosts_license ON mak_hosts(license_id);
CREATE INDEX IF NOT EXISTS idx_mak_hosts_package ON mak_hosts(package_name);
CREATE INDEX IF NOT EXISTS idx_mak_hosts_status ON mak_hosts(status);

-- ---------------------------------------------------------------------------
-- Approved guest applications (global registry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_guest_apps (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  package_name  TEXT NOT NULL,
  app_name      TEXT NOT NULL DEFAULT '',
  apk_sha256    TEXT NOT NULL,
  cert_sha256   TEXT NOT NULL,
  version_code  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(package_name, apk_sha256, cert_sha256)
);
CREATE INDEX IF NOT EXISTS idx_mak_guests_package ON mak_guest_apps(package_name);
CREATE INDEX IF NOT EXISTS idx_mak_guests_status ON mak_guest_apps(status);

-- ---------------------------------------------------------------------------
-- License <-> guest allow-list, with per-operation permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_bindings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id   INTEGER NOT NULL,
  host_id      INTEGER NOT NULL DEFAULT 0, -- 0 = license-wide (admin) binding
  guest_app_id INTEGER NOT NULL,
  can_install  INTEGER NOT NULL DEFAULT 1,
  can_launch   INTEGER NOT NULL DEFAULT 1,
  can_update   INTEGER NOT NULL DEFAULT 1,
  can_restart  INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE(license_id, host_id, guest_app_id)
);
CREATE INDEX IF NOT EXISTS idx_mak_bindings_license ON mak_bindings(license_id);
CREATE INDEX IF NOT EXISTS idx_mak_bindings_host ON mak_bindings(license_id, host_id);
CREATE INDEX IF NOT EXISTS idx_mak_bindings_guest ON mak_bindings(guest_app_id);

-- ---------------------------------------------------------------------------
-- Devices: ECDSA P-256 public keys registered against a license
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_devices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  device_uid   TEXT NOT NULL UNIQUE,
  license_id   INTEGER NOT NULL,
  public_key   TEXT NOT NULL, -- spki:<base64 DER>
  fingerprint  TEXT NOT NULL,
  -- Client-reported device id. Never used as a security binding; stored only
  -- for audit and so an administrator can enable a device-id policy later.
  device_id    TEXT NOT NULL DEFAULT '',
  device_id_first TEXT NOT NULL DEFAULT '',
  key_algorithm TEXT NOT NULL DEFAULT 'ECDSA-P256',
  status       TEXT NOT NULL DEFAULT 'ACTIVE',
  registered_at INTEGER NOT NULL,
  last_seen    INTEGER,
  revoked_at   INTEGER,
  UNIQUE(license_id, public_key)
);
CREATE INDEX IF NOT EXISTS idx_mak_devices_license ON mak_devices(license_id);
CREATE INDEX IF NOT EXISTS idx_mak_devices_status ON mak_devices(status);
CREATE INDEX IF NOT EXISTS idx_mak_devices_fingerprint ON mak_devices(fingerprint);

-- ---------------------------------------------------------------------------
-- Single-use challenges (nonce hash stored, raw nonce never persisted)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_challenges (
  id          TEXT PRIMARY KEY,
  nonce_hash  TEXT NOT NULL,
  license_id  INTEGER,
  ip_hash     TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mak_challenges_expiry ON mak_challenges(expires_at);

-- ---------------------------------------------------------------------------
-- Authenticated sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_sessions (
  id            TEXT PRIMARY KEY,
  license_id    INTEGER NOT NULL,
  device_id     INTEGER NOT NULL,
  host_id       INTEGER,
  issued_at     INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  last_heartbeat INTEGER,
  revoked_at    INTEGER,
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  request_id    TEXT,
  ip_hash       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_mak_sessions_license ON mak_sessions(license_id);
CREATE INDEX IF NOT EXISTS idx_mak_sessions_device ON mak_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_mak_sessions_status ON mak_sessions(status);
CREATE INDEX IF NOT EXISTS idx_mak_sessions_expiry ON mak_sessions(expires_at);

-- ---------------------------------------------------------------------------
-- Revocation ledger (licenses, devices, sessions, guests, hosts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_revocations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  actor       TEXT NOT NULL DEFAULT 'SYSTEM',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mak_revocations_target ON mak_revocations(target_type, target_id);

-- ---------------------------------------------------------------------------
-- Security / audit events. Never store raw MAK values or device proofs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id   INTEGER,
  device_id    INTEGER,
  host_id      INTEGER,
  guest_app_id INTEGER,
  event_type   TEXT NOT NULL,
  result       TEXT NOT NULL DEFAULT 'INFO', -- ALLOW | DENY | SUCCESS | ERROR | INFO
  error_code   TEXT NOT NULL DEFAULT '',
  device_uid   TEXT NOT NULL DEFAULT '', -- client-reported device id (audit only)
  detail       TEXT NOT NULL DEFAULT '',
  actor        TEXT NOT NULL DEFAULT 'CLIENT',
  request_id   TEXT NOT NULL DEFAULT '',
  ip_hash      TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mak_events_license ON mak_events(license_id);
CREATE INDEX IF NOT EXISTS idx_mak_events_type ON mak_events(event_type);
CREATE INDEX IF NOT EXISTS idx_mak_events_result ON mak_events(result);
CREATE INDEX IF NOT EXISTS idx_mak_events_created ON mak_events(created_at);
