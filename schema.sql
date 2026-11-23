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
  host_bind_mode   TEXT NOT NULL DEFAULT 'FIRST_USE', -- FIRST_USE | STRICT
  notes            TEXT NOT NULL DEFAULT '',
  created_by       INTEGER,
  last_used_at     INTEGER,
  rotated_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mak_licenses_status ON mak_licenses(status);
CREATE INDEX IF NOT EXISTS idx_mak_licenses_expiry ON mak_licenses(expires_at);

-- ---------------------------------------------------------------------------
-- Host APK binding: package + signing certificate (one host per license)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_hosts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id    INTEGER NOT NULL UNIQUE,
  package_name  TEXT NOT NULL,
  cert_sha256   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  version_policy TEXT NOT NULL DEFAULT 'ANY',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_seen     INTEGER
);
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
  guest_app_id INTEGER NOT NULL,
  can_install  INTEGER NOT NULL DEFAULT 1,
  can_launch   INTEGER NOT NULL DEFAULT 1,
  can_update   INTEGER NOT NULL DEFAULT 1,
  can_restart  INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE(license_id, guest_app_id)
);
CREATE INDEX IF NOT EXISTS idx_mak_bindings_license ON mak_bindings(license_id);
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
