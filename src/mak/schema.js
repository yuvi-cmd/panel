// Generated from schema.sql — keep both in sync.
export const SCHEMA = `-- MAK ACTIVATION KEY (MAK/2) — Cloudflare D1 schema
-- Fresh install:
--   npx wrangler d1 execute panel --file=schema.sql
-- The Worker also runs this idempotently on first request per isolate.
-- Timestamps are Unix seconds (INTEGER), matching the MAK/2 wire protocol.

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
  credential_plain TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | SUSPENDED | REVOKED
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  expires_at       INTEGER,
  duration_days    INTEGER, -- numeric duration; starts on first runtime bind
  started_at       INTEGER, -- first successful /activate; expiry never resets
  max_devices      INTEGER NOT NULL DEFAULT 1,
  max_activations  INTEGER NOT NULL DEFAULT 1,
  activation_count INTEGER NOT NULL DEFAULT 0,
  session_ttl      INTEGER NOT NULL DEFAULT 3600,
  max_packages     INTEGER NOT NULL DEFAULT 1, -- host APK package names this MAK may bind
  guest_app_limit  INTEGER, -- NULL = unlimited guest apps per host (positive = explicit cap)
  max_apps         INTEGER NOT NULL DEFAULT 2, -- legacy column, no longer enforced
  max_installs     INTEGER NOT NULL DEFAULT 3, -- legacy column, no longer enforced
  signature_bind   INTEGER NOT NULL DEFAULT 1, -- 1 = verify APK signing cert per app
  host_bind_mode   TEXT NOT NULL DEFAULT 'AUTO', -- AUTO | MANUAL
  epoch            INTEGER NOT NULL DEFAULT 1, -- monotonic policy/revocation version
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
-- MAK/2 server keyring. Generated from /sdk/server ("Generate keys"), never
-- compiled into the app and never returned by any API except the public halves
-- in /mak/v2/status. D1 encrypts storage at rest; only the keystore reads the
-- secret_key column.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_server_keys (
  key_id     TEXT PRIMARY KEY,
  algorithm  TEXT NOT NULL,                -- ED25519 | X25519
  public_key TEXT NOT NULL,
  secret_key TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | RETIRED
  created_at INTEGER NOT NULL,
  retired_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mak_server_keys_algo ON mak_server_keys(algorithm, status);

-- Signed rotation chain. An existing client that still trusts the previous
-- Ed25519 key verifies the new key from here before using it. This is what
-- lets the panel rotate keys without rebuilding the AAR.
CREATE TABLE IF NOT EXISTS mak_server_key_rotations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  previous_key_id   TEXT NOT NULL,
  new_key_id        TEXT NOT NULL,
  statement         TEXT NOT NULL,          -- canonical JSON, signed by previous key
  signature         TEXT NOT NULL,          -- base64 Ed25519
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mak_key_rotations_created ON mak_server_key_rotations(created_at);

-- ---------------------------------------------------------------------------
-- Grants (MAK/2 seats). A grant is a random installation/seat token, not a
-- hardware identifier. The client stores it encrypted; revocation is per grant.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_grants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  grant_id      TEXT NOT NULL UNIQUE,
  license_id    INTEGER NOT NULL,
  host_id       INTEGER NOT NULL,
  package_name  TEXT NOT NULL,
  app_name      TEXT NOT NULL DEFAULT '',
  cert_sha256   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | REVOKED
  epoch         INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  last_seen     INTEGER,
  revoked_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mak_grants_license ON mak_grants(license_id);
CREATE INDEX IF NOT EXISTS idx_mak_grants_host ON mak_grants(license_id, host_id);
CREATE INDEX IF NOT EXISTS idx_mak_grants_status ON mak_grants(status);

-- ---------------------------------------------------------------------------
-- Replay cache for MAK/2 request nonces (server time; 5 minute window).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mak_nonces (
  nonce_hash  TEXT PRIMARY KEY,
  endpoint    TEXT NOT NULL DEFAULT '',
  grant_id    TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mak_nonces_expiry ON mak_nonces(expires_at);

-- ---------------------------------------------------------------------------
-- Legacy MAK/1 devices (kept for old databases; MAK/2 does not use this table)
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
`;
