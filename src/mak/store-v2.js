// MAK/2 repository helpers. Grants are random seat tokens, not device IDs.
// Nonces are stored as SHA-256 hashes and expire on server time.

import { nowS } from './crypto.js';

export async function getGrantById(db, grantId) {
  return db.prepare(
    `SELECT g.*,
            l.status AS license_status, l.expires_at AS license_expires_at,
            l.epoch AS license_epoch, l.signature_bind, l.max_apps, l.max_installs,
            l.host_bind_mode, l.label AS license_label,
            h.status AS host_status, h.package_name AS host_package,
            h.app_name AS host_app_name, h.cert_sha256 AS host_cert
       FROM mak_grants g
       JOIN mak_licenses l ON l.id=g.license_id
       JOIN mak_hosts h ON h.id=g.host_id
      WHERE g.grant_id=?`,
  ).bind(String(grantId || '')).first().catch(() => null);
}

export async function countActiveGrants(db, licenseId, hostId) {
  const row = await db.prepare(
    "SELECT COUNT(*) AS c FROM mak_grants WHERE license_id=? AND host_id=? AND status='ACTIVE'",
  ).bind(Number(licenseId) || 0, Number(hostId) || 0).first().catch(() => null);
  return Number(row?.c || 0);
}

// Atomic seat allocation: the insert only happens while the active grant count
// for this host is below max_installs. D1 serialises writes, so two concurrent
// activations cannot both take the last seat.
export async function createGrantAtomic(db, input) {
  const now = nowS();
  const row = await db.prepare(
    `INSERT INTO mak_grants
       (grant_id,license_id,host_id,package_name,app_name,cert_sha256,status,epoch,created_at)
     SELECT ?,?,?,?,?,?,'ACTIVE',?,?
      WHERE (SELECT COUNT(*) FROM mak_grants
              WHERE license_id=? AND host_id=? AND status='ACTIVE') < ?
     RETURNING *`,
  ).bind(
    String(input.grant_id),
    Number(input.license_id),
    Number(input.host_id),
    String(input.package_name || ''),
    String(input.app_name || ''),
    String(input.cert_sha256 || ''),
    Number(input.epoch) || 1,
    now,
    Number(input.license_id),
    Number(input.host_id),
    Math.max(1, Number(input.max_installs) || 1),
  ).first().catch(() => null);
  if (!row) return { ok: false, code: 'INSTALL_LIMIT_REACHED' };
  return { ok: true, grant: row };
}

// Idempotency window: a retried activation for the same host/package/cert
// reuses the recent grant instead of burning another seat.
export async function findRecentGrant(db, licenseId, hostId, packageName, certSha, windowSeconds = 300) {
  return db.prepare(
    `SELECT * FROM mak_grants
      WHERE license_id=? AND host_id=? AND package_name=? AND cert_sha256=?
        AND status='ACTIVE' AND created_at>=?
      ORDER BY id DESC LIMIT 1`,
  ).bind(
    Number(licenseId) || 0, Number(hostId) || 0,
    String(packageName || ''), String(certSha || ''),
    nowS() - Math.max(30, Number(windowSeconds) || 300),
  ).first().catch(() => null);
}

export async function touchGrant(db, grantId) {
  await db.prepare('UPDATE mak_grants SET last_seen=? WHERE grant_id=?')
    .bind(nowS(), String(grantId || '')).run().catch(() => {});
}

export async function revokeGrant(db, grantId, reason = '', actor = 'ADMIN') {
  const now = nowS();
  const row = await db.prepare(
    "UPDATE mak_grants SET status='REVOKED',revoked_at=?,last_seen=? WHERE grant_id=? AND status='ACTIVE' RETURNING license_id,host_id",
  ).bind(now, now, String(grantId || '')).first().catch(() => null);
  if (row?.license_id) {
    await db.prepare(
      "INSERT INTO mak_revocations (target_type,target_id,reason,actor,created_at) VALUES ('GRANT',?,?,?,?)",
    ).bind(String(grantId || ''), String(reason || ''), String(actor || 'ADMIN'), now).run().catch(() => {});
  }
  return !!row;
}

export async function revokeGrantsForLicense(db, licenseId, reason = '', actor = 'ADMIN') {
  const now = nowS();
  const result = await db.prepare(
    "UPDATE mak_grants SET status='REVOKED',revoked_at=?,last_seen=? WHERE license_id=? AND status='ACTIVE'",
  ).bind(now, now, Number(licenseId)).run().catch(() => null);
  if (result) {
    await db.prepare(
      "INSERT INTO mak_revocations (target_type,target_id,reason,actor,created_at) VALUES ('LICENSE_GRANTS',?,?,?,?)",
    ).bind(String(licenseId), String(reason || ''), String(actor || 'ADMIN'), now).run().catch(() => {});
  }
  return Number(result?.meta?.changes || 0);
}

export async function listGrantsForLicense(db, licenseId) {
  return (await db.prepare(
    'SELECT * FROM mak_grants WHERE license_id=? ORDER BY id DESC LIMIT 200',
  ).bind(Number(licenseId) || 0).all().catch(() => ({ results: [] }))).results || [];
}

export async function listActiveGrantsForHost(db, licenseId, hostId) {
  return (await db.prepare(
    "SELECT * FROM mak_grants WHERE license_id=? AND host_id=? AND status='ACTIVE' ORDER BY id DESC LIMIT 100",
  ).bind(Number(licenseId) || 0, Number(hostId) || 0).all().catch(() => ({ results: [] }))).results || [];
}

// ---------------------------------------------------------------------------
// Nonce replay cache
// ---------------------------------------------------------------------------
export async function consumeNonce(db, nonceHash, endpoint, grantId, ttlSeconds = 300) {
  const now = nowS();
  const expiresAt = now + Math.max(60, Math.min(900, Number(ttlSeconds) || 300));
  const row = await db.prepare(
    `INSERT INTO mak_nonces (nonce_hash,endpoint,grant_id,created_at,expires_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT(nonce_hash) DO NOTHING
     RETURNING nonce_hash`,
  ).bind(String(nonceHash), String(endpoint || ''), String(grantId || ''), now, expiresAt).first().catch(() => null);
  if (!row) return { ok: false, code: 'NONCE_REPLAY' };
  // Opportunistic cleanup; failures are harmless.
  await db.prepare('DELETE FROM mak_nonces WHERE expires_at < ?').bind(now - 60).run().catch(() => {});
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Guest apps (MAK/2 identity = package + signing cert, APK hash is audit only)
// ---------------------------------------------------------------------------
export async function findGuestByPackageCert(db, packageName, certSha) {
  return db.prepare(
    `SELECT * FROM mak_guest_apps
      WHERE package_name=? AND cert_sha256=? AND status='ACTIVE'
      ORDER BY id DESC LIMIT 1`,
  ).bind(String(packageName || ''), String(certSha || '')).first().catch(() => null);
}

export async function findGuestByPackageAny(db, packageName) {
  return db.prepare(
    `SELECT * FROM mak_guest_apps
      WHERE package_name=? AND status='ACTIVE'
      ORDER BY id DESC LIMIT 1`,
  ).bind(String(packageName || '')).first().catch(() => null);
}

export async function findGuestById(db, id) {
  return db.prepare('SELECT * FROM mak_guest_apps WHERE id=?')
    .bind(Number(id) || 0).first().catch(() => null);
}

export async function createGuestV2(db, input) {
  const now = nowS();
  const existing = await findGuestByPackageCert(db, input.package_name, input.cert_sha256);
  if (existing) return existing;
  const row = await db.prepare(
    `INSERT INTO mak_guest_apps
       (package_name,app_name,apk_sha256,cert_sha256,version_code,status,created_at,updated_at)
     VALUES (?,?,?,?,?,'ACTIVE',?,?)
     ON CONFLICT(package_name,apk_sha256,cert_sha256) DO UPDATE SET
       app_name=CASE WHEN excluded.app_name<>'' THEN excluded.app_name ELSE mak_guest_apps.app_name END,
       version_code=CASE WHEN excluded.version_code>0 THEN excluded.version_code ELSE mak_guest_apps.version_code END,
       updated_at=excluded.updated_at
     RETURNING *`,
  ).bind(
    String(input.package_name || ''),
    String(input.app_name || ''),
    String(input.apk_sha256 || ''),
    String(input.cert_sha256 || ''),
    Number(input.version_code) || 0,
    now, now,
  ).first().catch(() => null);
  return row || findGuestByPackageCert(db, input.package_name, input.cert_sha256);
}

export async function setGuestCert(db, id, certSha) {
  await db.prepare('UPDATE mak_guest_apps SET cert_sha256=?,updated_at=? WHERE id=?')
    .bind(String(certSha || ''), nowS(), Number(id) || 0).run().catch(() => {});
}

export async function updateGuestSeen(db, id, input) {
  const now = nowS();
  await db.prepare(
    `UPDATE mak_guest_apps SET
       app_name=CASE WHEN ?<>'' THEN ? ELSE app_name END,
       apk_sha256=CASE WHEN ?<>'' THEN ? ELSE apk_sha256 END,
       version_code=CASE WHEN ?>0 THEN ? ELSE version_code END,
       updated_at=?
     WHERE id=?`,
  ).bind(
    String(input.app_name || ''), String(input.app_name || ''),
    String(input.apk_sha256 || ''), String(input.apk_sha256 || ''),
    Number(input.version_code) || 0, Number(input.version_code) || 0,
    now, Number(id) || 0,
  ).run().catch(() => {});
}

// ---------------------------------------------------------------------------
// License epoch / policy
// ---------------------------------------------------------------------------
export async function bumpLicenseEpoch(db, licenseId) {
  const row = await db.prepare(
    'UPDATE mak_licenses SET epoch=COALESCE(epoch,1)+1,updated_at=? WHERE id=? RETURNING epoch',
  ).bind(nowS(), Number(licenseId)).first().catch(() => null);
  return Number(row?.epoch || 0);
}
