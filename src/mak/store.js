// D1 repository. Every query is prepared; no user-controlled SQL fragments.

import { makCredentialVariants, makHash, nowS, randomId } from './crypto.js';
import { bumpLicenseEpoch, revokeGrantsForLicense } from './store-v2.js';

const LICENSE_POLICY_KEYS = new Set([
  'label', 'user_ref', 'max_devices', 'max_activations', 'session_ttl',
  'max_packages', 'host_app_limit', 'guest_app_limit', 'max_apps', 'max_installs', 'signature_bind',
  'host_bind_mode', 'notes', 'expires_at', 'duration_days',
]);

// ---------------------------------------------------------------------------
// Licenses
// ---------------------------------------------------------------------------
export async function getLicenseById(db, id) {
  return db.prepare('SELECT * FROM mak_licenses WHERE id=?').bind(Number(id) || 0).first().catch(() => null);
}

export async function getLicenseByUid(db, uid) {
  return db.prepare('SELECT * FROM mak_licenses WHERE license_uid=?').bind(String(uid || '')).first().catch(() => null);
}

export async function getLicenseByHash(db, hash) {
  return db.prepare('SELECT * FROM mak_licenses WHERE credential_hash=?').bind(String(hash || '')).first().catch(() => null);
}

export async function findLicenseByCredential(db, value) {
  for (const variant of makCredentialVariants(value)) {
    const license = await getLicenseByHash(db, await makHash(variant));
    if (license) return license;
  }
  return null;
}

export async function licenseCounts(db) {
  const now = nowS();
  const row = await db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='ACTIVE' AND (expires_at IS NULL OR expires_at>?) THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status='ACTIVE' AND expires_at IS NOT NULL AND expires_at<=? THEN 1 ELSE 0 END) AS expired,
            SUM(CASE WHEN status='SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
            SUM(CASE WHEN status='REVOKED' THEN 1 ELSE 0 END) AS revoked
       FROM mak_licenses`,
  ).bind(now, now).first().catch(() => null);
  return {
    total: Number(row?.total || 0),
    active: Number(row?.active || 0),
    expired: Number(row?.expired || 0),
    suspended: Number(row?.suspended || 0),
    revoked: Number(row?.revoked || 0),
  };
}

export async function listLicenses(db, { q = '', status = 'ALL' } = {}) {
  const now = nowS();
  const where = [];
  const args = [];
  const s = String(status || 'ALL').toUpperCase();
  if (s === 'ACTIVE') { where.push("l.status='ACTIVE' AND (l.expires_at IS NULL OR l.expires_at>?)"); args.push(now); }
  else if (s === 'EXPIRED') { where.push("l.status='ACTIVE' AND l.expires_at IS NOT NULL AND l.expires_at<=?"); args.push(now); }
  else if (s === 'SUSPENDED') { where.push("l.status='SUSPENDED'"); }
  else if (s === 'REVOKED') { where.push("l.status='REVOKED'"); }
  const search = String(q || '').trim();
  if (search) {
    where.push('(l.license_uid LIKE ? OR l.label LIKE ? OR l.user_ref LIKE ? OR EXISTS (SELECT 1 FROM mak_hosts hs WHERE hs.license_id=l.id AND hs.package_name LIKE ?))');
    const like = `%${search}%`;
    args.push(like, like, like, like);
  }
  const sql = `SELECT l.*,
                      (SELECT package_name FROM mak_hosts WHERE license_id=l.id ORDER BY id LIMIT 1) AS host_package,
                      (SELECT status FROM mak_hosts WHERE license_id=l.id ORDER BY id LIMIT 1) AS host_status,
                      (SELECT cert_sha256 FROM mak_hosts WHERE license_id=l.id ORDER BY id LIMIT 1) AS host_cert_sha256,
                      (SELECT COUNT(DISTINCT hm.package_name) FROM mak_hosts hm WHERE hm.license_id=l.id) AS package_count,
                      (SELECT COALESCE(MAX(c),0)
                         FROM (SELECT COUNT(*) AS c FROM mak_hosts hm WHERE hm.license_id=l.id GROUP BY hm.package_name)) AS host_app_count,
                      (SELECT COUNT(*) FROM mak_devices d WHERE d.license_id=l.id AND d.status='ACTIVE') AS device_count,
                      (SELECT COUNT(*) FROM mak_bindings b WHERE b.license_id=l.id AND b.status='ACTIVE') AS guest_count,
                      COALESCE(
                        (SELECT MAX((SELECT COUNT(DISTINCT g.package_name || char(31) || COALESCE(NULLIF(g.app_name,''), g.package_name))
                                       FROM mak_bindings b JOIN mak_guest_apps g ON g.id=b.guest_app_id
                                      WHERE b.license_id=l.id AND b.status='ACTIVE'
                                        AND (b.host_id=h.id OR b.host_id=0)))
                           FROM mak_hosts h WHERE h.license_id=l.id),
                        (SELECT COUNT(DISTINCT g.package_name || char(31) || COALESCE(NULLIF(g.app_name,''), g.package_name))
                           FROM mak_bindings b JOIN mak_guest_apps g ON g.id=b.guest_app_id
                          WHERE b.license_id=l.id AND b.status='ACTIVE')
                      ) AS guest_app_count,
                      COALESCE(
                        (SELECT MAX((CASE WHEN h.app_name<>'' THEN 1 ELSE 0 END) +
                           (SELECT COUNT(DISTINCT COALESCE(NULLIF(g.app_name,''), g.package_name))
                              FROM mak_bindings b JOIN mak_guest_apps g ON g.id=b.guest_app_id
                             WHERE b.license_id=l.id AND b.status='ACTIVE'
                               AND (b.host_id=h.id OR b.host_id=0)))
                           FROM mak_hosts h WHERE h.license_id=l.id),
                        (SELECT COUNT(DISTINCT COALESCE(NULLIF(g.app_name,''), g.package_name))
                           FROM mak_bindings b JOIN mak_guest_apps g ON g.id=b.guest_app_id
                          WHERE b.license_id=l.id AND b.status='ACTIVE')
                      ) AS app_count
                 FROM mak_licenses l
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY l.id DESC LIMIT 300`;
  return (await db.prepare(sql).bind(...args).all().catch(() => ({ results: [] }))).results || [];
}

export async function createLicenseRecord(db, input) {
  const now = nowS();
  const inserted = await db.prepare(
    `INSERT INTO mak_licenses
      (license_uid,label,user_ref,credential_hash,credential_plain,status,created_at,updated_at,expires_at,
       duration_days,
       max_devices,max_activations,activation_count,session_ttl,max_packages,host_app_limit,guest_app_limit,max_apps,
       max_installs,signature_bind,host_bind_mode,epoch,notes,created_by)
     VALUES (?,?,?,?,?, 'ACTIVE', ?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,1,?,?)
     RETURNING id`,
  ).bind(
    input.license_uid,
    input.label || '',
    input.user_ref || '',
    input.credential_hash,
    String(input.credential_plain || '').slice(0, 120),
    now, now, input.expires_at || null,
    Number(input.duration_days) > 0 ? Number(input.duration_days) : null,
    input.max_devices || 1, input.max_activations || 1,
    input.session_ttl || 3600,
    input.max_packages || 1,
    input.host_app_limit || 1,
    input.guest_app_limit == null || input.guest_app_limit === '' ? null : Number(input.guest_app_limit),
    input.max_apps || 2,
    input.max_installs || 3,
    input.signature_bind ? 1 : 0,
    input.host_bind_mode || 'AUTO',
    input.notes || '', input.created_by || null,
  ).first();
  const id = Number(inserted?.id);
  if (!id) throw new Error('license insert did not return id');

  const stmts = [];
  if (input.host?.package_name) {
    // Signature Bind OFF allows a package pin without a certificate. Store an
    // empty string instead of dropping the host row; the protocol skips cert
    // checks when signature_bind is off.
    stmts.push(db.prepare(
      `INSERT INTO mak_hosts (license_id,package_name,app_name,cert_sha256,status,version_policy,created_at,updated_at)
       VALUES (?,?,?,?,'ACTIVE','ANY',?,?)`,
    ).bind(id, input.host.package_name, input.host.app_name || '', input.host.cert_sha256 || '', now, now));
  }
  for (const guestId of input.guest_ids || []) {
    // Admin-selected guests are license-wide (host_id=0), so every host package
    // under this MAK can use them unless a host-specific binding is added later.
    stmts.push(db.prepare(
      `INSERT OR IGNORE INTO mak_bindings
        (license_id,host_id,guest_app_id,can_install,can_launch,can_update,can_restart,status,created_at,updated_at)
       VALUES (?,0,?,1,1,1,1,'ACTIVE',?,?)`,
    ).bind(id, Number(guestId), now, now));
  }
  if (stmts.length) await db.batch(stmts);
  return id;
}

export async function updateLicensePolicy(db, id, patch) {
  const keys = Object.keys(patch).filter((k) => LICENSE_POLICY_KEYS.has(k));
  if (!keys.length) return;
  const sets = keys.map((k) => `${k}=?`).join(',');
  const args = keys.map((k) => patch[k]);
  await db.prepare(`UPDATE mak_licenses SET ${sets},updated_at=? WHERE id=?`)
    .bind(...args, nowS(), Number(id)).run();
  const securityKeys = keys.filter((k) => !['label', 'user_ref', 'notes'].includes(k));
  if (securityKeys.length) {
    await revokeGrantsForLicense(db, id, 'license policy changed', 'ADMIN');
    await bumpLicenseEpoch(db, id);
  }
}

// Extending duration or raising quotas does not invalidate any existing grant:
// nothing that was previously allowed becomes denied. Keep active seats alive.
export async function updateLicenseQuota(db, id, patch) {
  const allowed = new Set(['expires_at', 'duration_days', 'started_at', 'max_packages', 'host_app_limit', 'guest_app_limit', 'max_apps', 'max_installs']);
  const keys = Object.keys(patch).filter((k) => allowed.has(k));
  if (!keys.length) return;
  const sets = keys.map((k) => `${k}=?`).join(',');
  const args = keys.map((k) => patch[k]);
  await db.prepare(`UPDATE mak_licenses SET ${sets},updated_at=? WHERE id=?`)
    .bind(...args, nowS(), Number(id)).run();
}

export async function setLicenseStatus(db, id, status) {
  await db.prepare('UPDATE mak_licenses SET status=?,updated_at=? WHERE id=?')
    .bind(status, nowS(), Number(id)).run();
  if (status !== 'ACTIVE') {
    await revokeSessionsForLicense(db, id);
    await revokeGrantsForLicense(db, id, 'license ' + String(status).toLowerCase(), 'ADMIN');
    await bumpLicenseEpoch(db, id);
  }
}

export async function revokeLicense(db, id, reason, actor = 'ADMIN') {
  const now = nowS();
  await db.prepare("UPDATE mak_licenses SET status='REVOKED',updated_at=? WHERE id=?").bind(now, Number(id)).run();
  await revokeSessionsForLicense(db, id);
  await revokeGrantsForLicense(db, id, reason, actor);
  await bumpLicenseEpoch(db, id);
  await recordRevocation(db, 'LICENSE', String(id), reason, actor);
}

// Hard delete. Unlike revoke (which keeps the row for audit), this removes the
// MAK and every runtime row that belongs to it. Security events are kept on
// purpose so the audit trail survives; they have no foreign key on license_id.
export async function deleteLicense(db, id) {
  const license = await getLicenseById(db, id);
  if (!license) return null;
  await db.batch([
    db.prepare('DELETE FROM mak_sessions WHERE license_id=?').bind(Number(id)),
    db.prepare('DELETE FROM mak_grants WHERE license_id=?').bind(Number(id)),
    db.prepare('DELETE FROM mak_bindings WHERE license_id=?').bind(Number(id)),
    db.prepare('DELETE FROM mak_hosts WHERE license_id=?').bind(Number(id)),
    db.prepare('DELETE FROM mak_devices WHERE license_id=?').bind(Number(id)),
    db.prepare('DELETE FROM mak_challenges WHERE license_id=?').bind(Number(id)),
    db.prepare('DELETE FROM mak_licenses WHERE id=?').bind(Number(id)),
  ]);
  return license;
}

export async function rotateLicenseCredential(db, id, hash, plain = '') {
  await db.prepare('UPDATE mak_licenses SET credential_hash=?,credential_plain=?,rotated_at=?,updated_at=? WHERE id=?')
    .bind(hash, String(plain || '').slice(0, 120), nowS(), nowS(), Number(id)).run();
  await revokeSessionsForLicense(db, id);
  await revokeGrantsForLicense(db, id, 'credential rotated', 'ADMIN');
  await bumpLicenseEpoch(db, id);
}

export async function touchLicense(db, id) {
  await db.prepare('UPDATE mak_licenses SET last_used_at=?,updated_at=? WHERE id=?')
    .bind(nowS(), nowS(), Number(id)).run().catch(() => {});
}

export async function expiringLicenses(db, withinSeconds = 7 * 86400, limit = 6) {
  const now = nowS();
  return (await db.prepare(
    `SELECT id,license_uid,label,expires_at FROM mak_licenses
      WHERE status='ACTIVE' AND expires_at IS NOT NULL AND expires_at>? AND expires_at<=?
      ORDER BY expires_at ASC LIMIT ?`,
  ).bind(now, now + withinSeconds, limit).all().catch(() => ({ results: [] }))).results || [];
}

// ---------------------------------------------------------------------------
// Host bindings
// ---------------------------------------------------------------------------
export async function getHostById(db, id) {
  return db.prepare('SELECT * FROM mak_hosts WHERE id=?').bind(Number(id) || 0).first().catch(() => null);
}

export async function getHostsForLicense(db, licenseId) {
  return (await db.prepare('SELECT * FROM mak_hosts WHERE license_id=? ORDER BY id')
    .bind(Number(licenseId) || 0).all().catch(() => ({ results: [] }))).results || [];
}

// Legacy single-host helper: first package registered for the license.
export async function getHostForLicense(db, licenseId) {
  return db.prepare('SELECT * FROM mak_hosts WHERE license_id=? ORDER BY id LIMIT 1')
    .bind(Number(licenseId) || 0).first().catch(() => null);
}

export async function findHostForLicensePackage(db, licenseId, packageName) {
  return db.prepare('SELECT * FROM mak_hosts WHERE license_id=? AND package_name=? ORDER BY id LIMIT 1')
    .bind(Number(licenseId) || 0, String(packageName || '')).first().catch(() => null);
}

export async function findHostForLicenseIdentity(db, licenseId, packageName, appName) {
  return db.prepare('SELECT * FROM mak_hosts WHERE license_id=? AND package_name=? AND app_name=?')
    .bind(Number(licenseId) || 0, String(packageName || ''), String(appName || '').trim())
    .first().catch(() => null);
}

// Legacy rows registered before the app-name limit existed carry an empty
// app_name. The first real activation adopts that row instead of spending a
// second app-name slot.
export async function findEmptyHostForLicensePackage(db, licenseId, packageName) {
  return db.prepare("SELECT * FROM mak_hosts WHERE license_id=? AND package_name=? AND app_name='' ORDER BY id LIMIT 1")
    .bind(Number(licenseId) || 0, String(packageName || '')).first().catch(() => null);
}

export async function countDistinctHostPackages(db, licenseId) {
  const row = await db.prepare('SELECT COUNT(DISTINCT package_name) AS c FROM mak_hosts WHERE license_id=?')
    .bind(Number(licenseId) || 0).first().catch(() => null);
  return Number(row?.c || 0);
}

export async function maxHostAppCount(db, licenseId) {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(c),0) AS c
       FROM (SELECT COUNT(*) AS c FROM mak_hosts WHERE license_id=? GROUP BY package_name)`,
  ).bind(Number(licenseId) || 0).first().catch(() => null);
  return Number(row?.c || 0);
}

export async function countActiveHosts(db, licenseId) {
  // Package slots are distinct package names. Suspended rows still count;
  // only an explicit host delete frees an app-name slot, and deleting the last
  // app name of a package frees the package slot.
  return countDistinctHostPackages(db, licenseId);
}

// Numeric durations begin on the first successful runtime app bind. The
// conditional UPDATE makes this a one-shot transition: later binds cannot
// reset started_at or push expires_at forward.
export async function startLicenseDurationAtomic(db, licenseId, now = nowS()) {
  const row = await db.prepare(
    `UPDATE mak_licenses
        SET started_at=?, expires_at=? + (duration_days * 86400), updated_at=?
      WHERE id=? AND started_at IS NULL AND duration_days IS NOT NULL AND duration_days>0
      RETURNING *`,
  ).bind(now, now, now, Number(licenseId) || 0).first().catch(() => null);
  return row || null;
}

// Atomic first-use bind. Two independent limits are checked inside the same
// statement: distinct packages < maxPackages, and app names for this package
// < hostAppLimit. An existing package may receive another app name without
// spending a new package slot. Suspended rows count because they still occupy
// slots until an administrator deletes them.
export async function createHostAtomic(db, licenseId, { package_name, app_name = '', cert_sha256, maxPackages, hostAppLimit }) {
  const now = nowS();
  const appLimit = Math.max(1, Number(hostAppLimit) || 1);
  const pkgLimit = Math.max(1, Number(maxPackages) || 1);
  const row = await db.prepare(
    `INSERT INTO mak_hosts (license_id,package_name,app_name,cert_sha256,status,version_policy,created_at,updated_at)
     SELECT ?,?,?,?, 'ACTIVE','ANY',?,?
      WHERE (SELECT COUNT(*) FROM mak_hosts WHERE license_id=? AND package_name=?) < ?
        AND ((SELECT COUNT(DISTINCT package_name) FROM mak_hosts WHERE license_id=?) < ?
             OR EXISTS (SELECT 1 FROM mak_hosts WHERE license_id=? AND package_name=?))
     RETURNING *`,
  ).bind(
    Number(licenseId), package_name, app_name || '', cert_sha256, now, now,
    Number(licenseId), package_name, appLimit,
    Number(licenseId), pkgLimit,
    Number(licenseId), package_name,
  ).first().catch(() => null);
  if (row) return { ok: true, host: row };
  const pkg = await db.prepare('SELECT 1 AS x FROM mak_hosts WHERE license_id=? AND package_name=? LIMIT 1')
    .bind(Number(licenseId), package_name).first().catch(() => null);
  return { ok: false, code: pkg ? 'APP_NAME_LIMIT_REACHED' : 'PACKAGE_LIMIT_REACHED' };
}

export async function upsertHost(db, licenseId, {
  package_name, app_name = '', cert_sha256, status = 'ACTIVE', version_policy = 'ANY',
  maxPackages, hostAppLimit,
}) {
  const now = nowS();
  const appName = String(app_name || '').trim();
  let existing = await findHostForLicenseIdentity(db, licenseId, package_name, appName);
  if (!existing) existing = await findEmptyHostForLicensePackage(db, licenseId, package_name);
  if (existing) {
    const row = await db.prepare(
      `UPDATE mak_hosts SET app_name=?,cert_sha256=?,status=?,version_policy=?,updated_at=?
        WHERE id=? AND license_id=? RETURNING *`,
    ).bind(appName || existing.app_name || '', cert_sha256, status, version_policy, now,
      Number(existing.id), Number(licenseId)).first().catch(() => null);
    return row ? { ok: true, host: row } : { ok: false, code: 'HOST_UPDATE_FAILED' };
  }
  return createHostAtomic(db, licenseId, {
    package_name, app_name: appName, cert_sha256, maxPackages, hostAppLimit,
  });
}

export async function setHostStatus(db, licenseId, status, hostId = 0) {
  if (Number(hostId) > 0) {
    await db.prepare('UPDATE mak_hosts SET status=?,updated_at=? WHERE id=? AND license_id=?')
      .bind(status, nowS(), Number(hostId), Number(licenseId)).run();
    return;
  }
  await db.prepare('UPDATE mak_hosts SET status=?,updated_at=? WHERE license_id=?')
    .bind(status, nowS(), Number(licenseId)).run();
}

export async function deleteHost(db, licenseId, hostId = 0) {
  if (Number(hostId) > 0) {
    await db.prepare('DELETE FROM mak_hosts WHERE id=? AND license_id=?')
      .bind(Number(hostId), Number(licenseId)).run();
    return;
  }
  await db.prepare('DELETE FROM mak_hosts WHERE license_id=?').bind(Number(licenseId)).run();
}

// Explicit package deletion. Unlike block/suspend this frees the package slot,
// so all host-scoped runtime state must go with it. License-wide bindings
// (host_id=0) stay because they apply to the remaining packages.
export async function deleteHostCascade(db, licenseId, hostId) {
  const id = Number(hostId) || 0;
  const lid = Number(licenseId) || 0;
  const host = id
    ? await db.prepare('SELECT * FROM mak_hosts WHERE id=? AND license_id=?').bind(id, lid).first().catch(() => null)
    : null;
  if (id && !host) return null;
  const stmts = [];
  if (id) {
    stmts.push(
      db.prepare('DELETE FROM mak_sessions WHERE license_id=? AND host_id=?').bind(lid, id),
      db.prepare('DELETE FROM mak_grants WHERE license_id=? AND host_id=?').bind(lid, id),
      db.prepare('DELETE FROM mak_bindings WHERE license_id=? AND host_id=?').bind(lid, id),
      db.prepare('DELETE FROM mak_hosts WHERE id=? AND license_id=?').bind(id, lid),
    );
  } else {
    stmts.push(
      db.prepare('DELETE FROM mak_sessions WHERE license_id=? AND host_id IS NOT NULL').bind(lid),
      db.prepare('DELETE FROM mak_grants WHERE license_id=?').bind(lid),
      db.prepare('DELETE FROM mak_bindings WHERE license_id=? AND host_id<>0').bind(lid),
      db.prepare('DELETE FROM mak_hosts WHERE license_id=?').bind(lid),
    );
  }
  if (stmts.length) {
    if (typeof db.batch === 'function') await db.batch(stmts);
    else for (const stmt of stmts) await stmt.run();
  }
  return host;
}

export async function touchHost(db, hostId) {
  await db.prepare('UPDATE mak_hosts SET last_seen=? WHERE id=?')
    .bind(nowS(), Number(hostId) || 0).run().catch(() => {});
}

export async function listHosts(db, { q = '', status = 'ALL' } = {}) {
  const where = [];
  const args = [];
  const s = String(status || 'ALL').toUpperCase();
  if (['ACTIVE', 'SUSPENDED'].includes(s)) { where.push('h.status=?'); args.push(s); }
  const search = String(q || '').trim();
  if (search) {
    where.push('(h.package_name LIKE ? OR l.license_uid LIKE ? OR l.label LIKE ?)');
    const like = `%${search}%`;
    args.push(like, like, like);
  }
  const sql = `SELECT h.*, l.license_uid, l.label, l.status AS license_status, l.expires_at
                 FROM mak_hosts h JOIN mak_licenses l ON l.id=h.license_id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY h.id DESC LIMIT 300`;
  return (await db.prepare(sql).bind(...args).all().catch(() => ({ results: [] }))).results || [];
}

// ---------------------------------------------------------------------------
// Guest applications + bindings
// ---------------------------------------------------------------------------
export async function listGuests(db, { q = '', status = 'ALL' } = {}) {
  const where = [];
  const args = [];
  const s = String(status || 'ALL').toUpperCase();
  if (['ACTIVE', 'SUSPENDED'].includes(s)) { where.push('g.status=?'); args.push(s); }
  const search = String(q || '').trim();
  if (search) {
    where.push('(g.package_name LIKE ? OR g.app_name LIKE ? OR g.apk_sha256 LIKE ?)');
    const like = `%${search}%`;
    args.push(like, like, like);
  }
  const sql = `SELECT g.*,
                      (SELECT COUNT(*) FROM mak_bindings b WHERE b.guest_app_id=g.id AND b.status='ACTIVE') AS binding_count
                 FROM mak_guest_apps g
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY g.id DESC LIMIT 300`;
  return (await db.prepare(sql).bind(...args).all().catch(() => ({ results: [] }))).results || [];
}

export async function getGuestById(db, id) {
  return db.prepare('SELECT * FROM mak_guest_apps WHERE id=?').bind(Number(id) || 0).first().catch(() => null);
}

export async function getGuestByIdentity(db, { package_name, apk_sha256, cert_sha256, version_code }) {
  return db.prepare(
    'SELECT * FROM mak_guest_apps WHERE package_name=? AND apk_sha256=? AND cert_sha256=? AND version_code=?',
  ).bind(package_name, apk_sha256, cert_sha256, Number(version_code) || 0).first().catch(() => null);
}

export async function findGuestByPackage(db, package_name) {
  return (await db.prepare('SELECT * FROM mak_guest_apps WHERE package_name=? ORDER BY id DESC LIMIT 10')
    .bind(package_name).all().catch(() => ({ results: [] }))).results || [];
}

export async function createGuest(db, input) {
  const now = nowS();
  const row = await db.prepare(
    `INSERT INTO mak_guest_apps
      (package_name,app_name,apk_sha256,cert_sha256,version_code,status,created_at,updated_at)
     VALUES (?,?,?,?,?,'ACTIVE',?,?) RETURNING id`,
  ).bind(input.package_name, input.app_name || '', input.apk_sha256, input.cert_sha256, input.version_code, now, now).first();
  return Number(row?.id) || 0;
}

export async function updateGuest(db, id, patch, statusOnly = false) {
  const now = nowS();
  if (statusOnly) {
    await db.prepare('UPDATE mak_guest_apps SET status=?,updated_at=? WHERE id=?')
      .bind(patch.status, now, Number(id)).run();
    return;
  }
  await db.prepare(
    `UPDATE mak_guest_apps SET app_name=?,apk_sha256=?,cert_sha256=?,version_code=?,status=?,updated_at=? WHERE id=?`,
  ).bind(patch.app_name, patch.apk_sha256, patch.cert_sha256, patch.version_code, patch.status, now, Number(id)).run();
}

export async function listAllActiveGuests(db) {
  return (await db.prepare("SELECT * FROM mak_guest_apps WHERE status='ACTIVE' ORDER BY app_name,package_name")
    .all().catch(() => ({ results: [] }))).results || [];
}

// Host-specific binding wins; host_id=0 is the license-wide admin binding.
export async function getBinding(db, licenseId, guestId, hostId = 0) {
  if (Number(hostId) > 0) {
    const specific = await db.prepare('SELECT * FROM mak_bindings WHERE license_id=? AND host_id=? AND guest_app_id=?')
      .bind(Number(licenseId), Number(hostId), Number(guestId)).first().catch(() => null);
    if (specific) return specific;
  }
  return db.prepare('SELECT * FROM mak_bindings WHERE license_id=? AND host_id=0 AND guest_app_id=?')
    .bind(Number(licenseId), Number(guestId)).first().catch(() => null);
}

export async function getHostBinding(db, licenseId, hostId, guestId) {
  return db.prepare('SELECT * FROM mak_bindings WHERE license_id=? AND host_id=? AND guest_app_id=?')
    .bind(Number(licenseId), Number(hostId), Number(guestId)).first().catch(() => null);
}

// A cloned app is identified by the pair the client sends with every guest
// request: APK package name + real app name. The limit counts these unique
// pairs, so a new version of the same app does not consume another slot, but
// a differently named clone does. char(31) cannot appear in a package name.
const GUEST_APP_KEY_SQL = "g.package_name || char(31) || COALESCE(NULLIF(g.app_name,''), g.package_name)";

export function guestAppKey(packageName, appName) {
  const pkg = String(packageName || '');
  const name = String(appName || '').trim() || pkg;
  return pkg + '\u001f' + name;
}

// Atomic AUTO bind. guestAppLimit is optional: null/0 means unlimited, a
// positive value caps the number of distinct cloned apps (package + app name)
// per host app identity. license-wide rows (host_id=0) count for every host,
// so a host_id=0 insert is checked against the license-wide maximum too.
// The signed host/guest identities remain mandatory and are verified by the
// client.
export async function bindGuestAtomic(db, licenseId, hostId, guestId, guestPackage, perms = {}, guestAppLimit = null, guestAppName = '') {
  const now = nowS();
  const cap = Number.isFinite(Number(guestAppLimit)) && Number(guestAppLimit) > 0
    ? Math.max(1, Math.floor(Number(guestAppLimit)))
    : 0;
  const appKey = guestAppKey(guestPackage, guestAppName);
  const row = await db.prepare(
    `INSERT INTO mak_bindings
       (license_id,host_id,guest_app_id,can_install,can_launch,can_update,can_restart,status,created_at,updated_at)
     SELECT ?,?,?,?,?,?,?, 'ACTIVE', ?,?
      WHERE ? = 0
         OR EXISTS (
              SELECT 1 FROM mak_bindings b JOIN mak_guest_apps g ON g.id=b.guest_app_id
               WHERE b.license_id=? AND (?=0 OR b.host_id=? OR b.host_id=0)
                 AND b.status='ACTIVE' AND ${GUEST_APP_KEY_SQL}=?
            )
         OR (
              SELECT COUNT(DISTINCT ${GUEST_APP_KEY_SQL})
                FROM mak_bindings b JOIN mak_guest_apps g ON g.id=b.guest_app_id
               WHERE b.license_id=? AND (?=0 OR b.host_id=? OR b.host_id=0) AND b.status='ACTIVE'
            ) < ?
     ON CONFLICT(license_id,host_id,guest_app_id) DO UPDATE SET
       can_install=excluded.can_install, can_launch=excluded.can_launch,
       can_update=excluded.can_update, can_restart=excluded.can_restart,
       status='ACTIVE', updated_at=excluded.updated_at
     RETURNING *`,
  ).bind(
    Number(licenseId), Number(hostId), Number(guestId),
    perms.install === false ? 0 : 1, perms.launch === false ? 0 : 1,
    perms.update === false ? 0 : 1, perms.restart === false ? 0 : 1,
    now, now,
    cap,
    Number(licenseId), Number(hostId), Number(hostId), appKey,
    Number(licenseId), Number(hostId), Number(hostId), cap,
  ).first().catch(() => null);
  if (!row) {
    return { ok: false, code: cap > 0 ? 'APP_LIMIT_REACHED' : 'BINDING_CREATE_FAILED' };
  }
  return { ok: true, binding: row };
}

export async function countDistinctGuestApps(db, licenseId) {
  const row = await db.prepare(
    `SELECT COUNT(DISTINCT ${GUEST_APP_KEY_SQL}) AS c
       FROM mak_bindings b JOIN mak_guest_apps g ON g.id=b.guest_app_id
      WHERE b.license_id=? AND b.status='ACTIVE'`,
  ).bind(Number(licenseId)).first().catch(() => null);
  return Number(row?.c || 0);
}

// The limit is per host app identity, so compare it with the busiest host app
// rather than with the license-wide total. license-wide bindings (host_id=0)
// count for every host app because each of them inherits those bindings.
export async function maxGuestAppCount(db, licenseId) {
  const row = await db.prepare(
    `SELECT MAX((SELECT COUNT(DISTINCT ${GUEST_APP_KEY_SQL})
                   FROM mak_bindings b JOIN mak_guest_apps g ON g.id=b.guest_app_id
                  WHERE b.license_id=? AND b.status='ACTIVE'
                    AND (b.host_id=h.id OR b.host_id=0))) AS c
       FROM mak_hosts h WHERE h.license_id=?`,
  ).bind(Number(licenseId), Number(licenseId)).first().catch(() => null);
  if (row && row.c != null) return Number(row.c);
  return countDistinctGuestApps(db, licenseId);
}

export async function listBindingsForLicense(db, licenseId) {
  return (await db.prepare(
    `SELECT b.*, g.package_name, g.app_name, g.apk_sha256, g.cert_sha256, g.version_code, g.status AS guest_status,
            h.package_name AS host_package
       FROM mak_bindings b JOIN mak_guest_apps g ON g.id=b.guest_app_id
       LEFT JOIN mak_hosts h ON h.id=b.host_id
      WHERE b.license_id=? ORDER BY b.host_id, b.id DESC`,
  ).bind(Number(licenseId)).all().catch(() => ({ results: [] }))).results || [];
}

export async function listBindingsForGuest(db, guestId) {
  return (await db.prepare(
    `SELECT b.*, l.license_uid, l.label, l.status AS license_status, l.expires_at
       FROM mak_bindings b JOIN mak_licenses l ON l.id=b.license_id
      WHERE b.guest_app_id=? ORDER BY b.id DESC`,
  ).bind(Number(guestId)).all().catch(() => ({ results: [] }))).results || [];
}

export async function bindGuest(db, licenseId, guestId, perms = {}, hostId = 0) {
  const now = nowS();
  await db.prepare(
    `INSERT INTO mak_bindings
      (license_id,host_id,guest_app_id,can_install,can_launch,can_update,can_restart,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?, 'ACTIVE', ?,?)
     ON CONFLICT(license_id,host_id,guest_app_id) DO UPDATE SET
       can_install=excluded.can_install, can_launch=excluded.can_launch,
       can_update=excluded.can_update, can_restart=excluded.can_restart,
       status='ACTIVE', updated_at=excluded.updated_at`,
  ).bind(
    Number(licenseId), Number(hostId) || 0, Number(guestId),
    perms.install ? 1 : 0, perms.launch ? 1 : 0, perms.update ? 1 : 0, perms.restart ? 1 : 0,
    now, now,
  ).run();
}

export async function updateBindingPermissions(db, licenseId, guestId, perms, hostId = 0) {
  await db.prepare(
    `UPDATE mak_bindings SET can_install=?,can_launch=?,can_update=?,can_restart=?,updated_at=?
      WHERE license_id=? AND guest_app_id=? AND (?=0 OR host_id=?)`,
  ).bind(
    perms.install ? 1 : 0, perms.launch ? 1 : 0, perms.update ? 1 : 0, perms.restart ? 1 : 0,
    nowS(), Number(licenseId), Number(guestId), Number(hostId) || 0, Number(hostId) || 0,
  ).run();
}

export async function unbindGuest(db, licenseId, guestId, hostId = 0) {
  await db.prepare(
    `UPDATE mak_bindings SET status='REVOKED',updated_at=?
      WHERE license_id=? AND guest_app_id=? AND (?=0 OR host_id=?)`,
  ).bind(nowS(), Number(licenseId), Number(guestId), Number(hostId) || 0, Number(hostId) || 0).run();
}

// Explicit app removal from a license. A hard delete is required because a
// Revoked binding must not keep consuming a guest-app slot forever after the
// operator deliberately deleted it.
export async function deleteBinding(db, licenseId, guestId, hostId = 0) {
  const res = await db.prepare(
    `DELETE FROM mak_bindings
      WHERE license_id=? AND guest_app_id=? AND (?=0 OR host_id=?)`,
  ).bind(Number(licenseId), Number(guestId), Number(hostId) || 0, Number(hostId) || 0).run();
  return Number(res?.meta?.changes || 0);
}

// Global guest-app delete. An approved app row is shared by multiple licenses,
// so removing it cascades every binding and frees those app slots.
export async function deleteGuestApp(db, guestId) {
  const guest = await getGuestById(db, guestId);
  if (!guest) return null;
  const stmts = [
    db.prepare('DELETE FROM mak_bindings WHERE guest_app_id=?').bind(Number(guestId)),
    db.prepare('DELETE FROM mak_guest_apps WHERE id=?').bind(Number(guestId)),
  ];
  if (typeof db.batch === 'function') await db.batch(stmts);
  else for (const stmt of stmts) await stmt.run();
  return guest;
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------
export async function getDeviceById(db, id) {
  return db.prepare('SELECT * FROM mak_devices WHERE id=?').bind(Number(id) || 0).first().catch(() => null);
}

export async function getDeviceByLicenseKey(db, licenseId, publicKey) {
  return db.prepare('SELECT * FROM mak_devices WHERE license_id=? AND public_key=?')
    .bind(Number(licenseId), String(publicKey)).first().catch(() => null);
}

export async function activeDeviceCount(db, licenseId) {
  const row = await db.prepare("SELECT COUNT(*) AS c FROM mak_devices WHERE license_id=? AND status='ACTIVE'")
    .bind(Number(licenseId)).first().catch(() => null);
  return Number(row?.c || 0);
}

export async function registerDeviceAtomic(db, licenseId, publicKey, fingerprint, reportedDeviceId = '') {
  const now = nowS();
  const deviceUid = randomId('DEV', 15);
  const deviceText = String(reportedDeviceId || '').slice(0, 128);
  const insert = db.prepare(
    `INSERT INTO mak_devices
      (device_uid,license_id,public_key,fingerprint,device_id,device_id_first,key_algorithm,status,registered_at,last_seen)
     SELECT ?,?,?,?,?,?, 'ECDSA-P256', 'ACTIVE', ?,?
      WHERE (SELECT COUNT(*) FROM mak_devices WHERE license_id=? AND status='ACTIVE')
            < (SELECT max_devices FROM mak_licenses WHERE id=?)
        AND (SELECT activation_count FROM mak_licenses WHERE id=?)
            < (SELECT max_activations FROM mak_licenses WHERE id=?)`,
  ).bind(deviceUid, Number(licenseId), publicKey, fingerprint, deviceText, deviceText, now, now, Number(licenseId), Number(licenseId), Number(licenseId), Number(licenseId));
  const bump = db.prepare(
    `UPDATE mak_licenses SET activation_count=activation_count+1,updated_at=?
      WHERE id=? AND activation_count < max_activations
        AND EXISTS (SELECT 1 FROM mak_devices WHERE license_id=? AND public_key=? AND status='ACTIVE')`,
  ).bind(now, Number(licenseId), Number(licenseId), publicKey);
  const results = await db.batch([insert, bump]);
  const changes = Number(results?.[0]?.meta?.changes || 0);
  if (!changes) {
    const lic = await getLicenseById(db, licenseId);
    if (!lic) return { ok: false, code: 'INVALID_LICENSE' };
    if (Number(lic.activation_count) >= Number(lic.max_activations)) return { ok: false, code: 'ACTIVATION_LIMIT_REACHED' };
    return { ok: false, code: 'DEVICE_LIMIT_REACHED' };
  }
  const device = await getDeviceByLicenseKey(db, licenseId, publicKey);
  return { ok: true, device };
}

export async function revokeDevice(db, id, reason = '', actor = 'ADMIN') {
  const device = await getDeviceById(db, id);
  if (!device) return null;
  await db.prepare("UPDATE mak_devices SET status='REVOKED',revoked_at=? WHERE id=?").bind(nowS(), Number(id)).run();
  await revokeSessionsForDevice(db, id);
  await recordRevocation(db, 'DEVICE', String(id), reason || 'Device revoked', actor);
  return device;
}

export async function deleteDevice(db, id, actor = 'ADMIN') {
  const device = await getDeviceById(db, id);
  if (!device) return null;
  await revokeSessionsForDevice(db, id);
  await db.prepare('DELETE FROM mak_devices WHERE id=?').bind(Number(id)).run();
  await recordRevocation(db, 'DEVICE', String(id), 'Device removed by administrator', actor);
  return device;
}

export async function resetLicenseDevices(db, licenseId, actor = 'ADMIN') {
  await db.prepare("UPDATE mak_devices SET status='REVOKED',revoked_at=? WHERE license_id=? AND status='ACTIVE'")
    .bind(nowS(), Number(licenseId)).run();
  await revokeSessionsForLicense(db, licenseId);
  await recordRevocation(db, 'DEVICE_GROUP', String(licenseId), 'All devices reset by administrator', actor);
}

export async function touchDevice(db, deviceId) {
  await db.prepare('UPDATE mak_devices SET last_seen=? WHERE id=?').bind(nowS(), Number(deviceId)).run().catch(() => {});
}

// device_id is audit metadata only. It never grants or denies access; it is
// stored so the server can add a device-id policy later without a migration.
export async function updateDeviceId(db, deviceId, reportedDeviceId) {
  const value = String(reportedDeviceId || '').slice(0, 128);
  if (!value) return;
  await db.prepare(
    `UPDATE mak_devices
        SET device_id=?, device_id_first=CASE WHEN device_id_first='' THEN ? ELSE device_id_first END
      WHERE id=?`,
  ).bind(value, value, Number(deviceId)).run().catch(() => {});
}

export async function listDevices(db, { q = '', status = 'ALL' } = {}) {  const where = [];
  const args = [];
  const s = String(status || 'ALL').toUpperCase();
  if (['ACTIVE', 'REVOKED'].includes(s)) { where.push('d.status=?'); args.push(s); }
  const search = String(q || '').trim();
  if (search) {
    where.push('(d.fingerprint LIKE ? OR d.device_uid LIKE ? OR l.license_uid LIKE ? OR l.label LIKE ?)');
    const like = `%${search}%`;
    args.push(like, like, like, like);
  }
  const sql = `SELECT d.*, l.license_uid, l.label, l.status AS license_status
                 FROM mak_devices d JOIN mak_licenses l ON l.id=d.license_id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY d.id DESC LIMIT 300`;
  return (await db.prepare(sql).bind(...args).all().catch(() => ({ results: [] }))).results || [];
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------
export async function createChallenge(db, { id, nonce_hash, expires_at, ip_hash }) {
  await db.prepare(
    'INSERT INTO mak_challenges (id,nonce_hash,ip_hash,created_at,expires_at) VALUES (?,?,?,?,?)',
  ).bind(id, nonce_hash, ip_hash || '', nowS(), expires_at).run();
}

export async function consumeChallenge(db, id, nonceHash) {
  const now = nowS();
  const res = await db.prepare(
    'UPDATE mak_challenges SET consumed_at=? WHERE id=? AND nonce_hash=? AND consumed_at IS NULL AND expires_at>=?',
  ).bind(now, String(id), String(nonceHash), now).run();
  if (Number(res?.meta?.changes || 0) === 1) return { ok: true };
  const row = await db.prepare('SELECT * FROM mak_challenges WHERE id=?').bind(String(id)).first().catch(() => null);
  if (!row) return { ok: false, reason: 'CHALLENGE_EXPIRED' };
  if (row.consumed_at) return { ok: false, reason: 'NONCE_REPLAY' };
  if (row.nonce_hash !== nonceHash) return { ok: false, reason: 'NONCE_REPLAY' };
  if (Number(row.expires_at) < now) return { ok: false, reason: 'CHALLENGE_EXPIRED' };
  return { ok: false, reason: 'CHALLENGE_EXPIRED' };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export async function createSession(db, { licenseId, deviceId, hostId, ttl, requestId, ipHash }) {
  const id = randomId('SES', 18);
  const now = nowS();
  const expires = now + Math.max(60, Number(ttl) || 3600);
  await db.prepare(
    `INSERT INTO mak_sessions (id,license_id,device_id,host_id,issued_at,expires_at,last_heartbeat,status,request_id,ip_hash)
     VALUES (?,?,?,?,?,?,?, 'ACTIVE', ?,?)`,
  ).bind(id, Number(licenseId), Number(deviceId), hostId || null, now, expires, now, String(requestId || '').slice(0, 96), ipHash || '').run();
  return { id, issued_at: now, expires_at: expires };
}

export async function getSession(db, id) {
  return db.prepare(
    `SELECT s.id AS session_id, s.license_id, s.device_id, s.host_id, s.issued_at, s.expires_at,
            s.last_heartbeat, s.revoked_at, s.status AS session_status, s.request_id,
            l.license_uid, l.label, l.status AS license_status, l.expires_at AS license_expires_at,
            l.session_ttl, l.max_devices, l.max_activations, l.max_packages, l.max_apps,
            l.host_bind_mode,
            d.public_key, d.fingerprint, d.status AS device_status, d.device_id AS device_text,
            h.package_name AS host_package, h.cert_sha256 AS host_cert_sha256, h.status AS host_status,
            h.app_name AS host_app_name
       FROM mak_sessions s
       JOIN mak_licenses l ON l.id=s.license_id
       JOIN mak_devices d ON d.id=s.device_id
       LEFT JOIN mak_hosts h ON h.id=s.host_id
      WHERE s.id=?`,
  ).bind(String(id || '')).first().catch(() => null);
}

export async function revokeSession(db, id, reason = '', actor = 'ADMIN') {
  const res = await db.prepare("UPDATE mak_sessions SET status='REVOKED',revoked_at=? WHERE id=? AND status='ACTIVE'")
    .bind(nowS(), String(id)).run();
  if (Number(res?.meta?.changes || 0)) {
    await recordRevocation(db, 'SESSION', String(id), reason || 'Session revoked', actor);
  }
  return Number(res?.meta?.changes || 0) > 0;
}

export async function revokeSessionsForLicense(db, licenseId) {
  await db.prepare("UPDATE mak_sessions SET status='REVOKED',revoked_at=? WHERE license_id=? AND status='ACTIVE'")
    .bind(nowS(), Number(licenseId)).run().catch(() => {});
}

export async function revokeSessionsForDevice(db, deviceId) {
  await db.prepare("UPDATE mak_sessions SET status='REVOKED',revoked_at=? WHERE device_id=? AND status='ACTIVE'")
    .bind(nowS(), Number(deviceId)).run().catch(() => {});
}

export async function revokeAllSessions(db, actor = 'ADMIN') {
  await db.prepare("UPDATE mak_sessions SET status='REVOKED',revoked_at=? WHERE status='ACTIVE'")
    .bind(nowS()).run();
  await recordRevocation(db, 'SESSION_GROUP', 'ALL', 'All sessions revoked by administrator', actor);
}

export async function renewSession(db, id, ttl) {
  const now = nowS();
  const expires = now + Math.max(60, Number(ttl) || 3600);
  await db.prepare('UPDATE mak_sessions SET expires_at=?,last_heartbeat=?,status=? WHERE id=?')
    .bind(expires, now, 'ACTIVE', String(id)).run();
  return expires;
}

export async function heartbeatSession(db, id) {
  await db.prepare('UPDATE mak_sessions SET last_heartbeat=? WHERE id=?').bind(nowS(), String(id)).run();
}

export async function listSessions(db, { q = '', status = 'ALL' } = {}) {
  const now = nowS();
  const where = [];
  const args = [];
  const s = String(status || 'ALL').toUpperCase();
  if (s === 'ACTIVE') { where.push("s.status='ACTIVE' AND s.expires_at>?"); args.push(now); }
  else if (s === 'EXPIRED') { where.push("s.status='ACTIVE' AND s.expires_at<=?"); args.push(now); }
  else if (s === 'REVOKED') { where.push("s.status='REVOKED'"); }
  const search = String(q || '').trim();
  if (search) {
    where.push('(s.id LIKE ? OR l.license_uid LIKE ? OR l.label LIKE ? OR h.package_name LIKE ?)');
    const like = `%${search}%`;
    args.push(like, like, like, like);
  }
  const sql = `SELECT s.*, l.license_uid, l.label, h.package_name AS host_package, d.fingerprint
                 FROM mak_sessions s
                 JOIN mak_licenses l ON l.id=s.license_id
                 LEFT JOIN mak_hosts h ON h.license_id=l.id
                 LEFT JOIN mak_devices d ON d.id=s.device_id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY s.issued_at DESC LIMIT 300`;
  return (await db.prepare(sql).bind(...args).all().catch(() => ({ results: [] }))).results || [];
}

export async function sessionsForLicense(db, licenseId) {
  return (await db.prepare(
    `SELECT s.*, d.fingerprint, h.package_name AS host_package
       FROM mak_sessions s LEFT JOIN mak_devices d ON d.id=s.device_id
       LEFT JOIN mak_hosts h ON h.license_id=s.license_id
      WHERE s.license_id=? ORDER BY s.issued_at DESC LIMIT 50`,
  ).bind(Number(licenseId)).all().catch(() => ({ results: [] }))).results || [];
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export async function dashboardStats(db) {
  const now = nowS();
  const licenses = await licenseCounts(db);
  const row = await db.prepare(
    `SELECT
      (SELECT COUNT(*) FROM mak_devices WHERE status='ACTIVE') AS devices,
      (SELECT COUNT(*) FROM mak_devices WHERE status='ACTIVE' AND last_seen>=?) AS devices_online,
      (SELECT COUNT(*) FROM mak_guest_apps WHERE status='ACTIVE') AS guests,
      (SELECT COUNT(*) FROM mak_hosts WHERE status='ACTIVE') AS hosts,
      (SELECT COUNT(*) FROM mak_grants WHERE status='ACTIVE') AS grants,
      (SELECT COUNT(*) FROM mak_sessions WHERE status='ACTIVE' AND expires_at>?) AS sessions,
      (SELECT COUNT(*) FROM mak_licenses WHERE created_at>=?) AS new_licenses,
      (SELECT SUM(activation_count) FROM mak_licenses) AS activations`,
  ).bind(now - 600, now, now - 7 * 86400).first().catch(() => null);
  return {
    ...licenses,
    devices: Number(row?.devices || 0),
    devices_online: Number(row?.devices_online || 0),
    guests: Number(row?.guests || 0),
    hosts: Number(row?.hosts || 0),
    grants: Number(row?.grants || 0),
    sessions: Number(row?.sessions || 0),
    new_licenses: Number(row?.new_licenses || 0),
    activations: Number(row?.activations || 0),
  };
}

// ---------------------------------------------------------------------------
// Small aggregate / detail helpers used by the panel
// ---------------------------------------------------------------------------
export async function devicesForLicense(db, licenseId) {
  return (await db.prepare('SELECT * FROM mak_devices WHERE license_id=? ORDER BY id DESC LIMIT 50')
    .bind(Number(licenseId)).all().catch(() => ({ results: [] }))).results || [];
}

export async function guestEvents(db, guestId, limit = 20) {
  return (await db.prepare('SELECT * FROM mak_events WHERE guest_app_id=? ORDER BY id DESC LIMIT ?')
    .bind(Number(guestId), Math.min(100, Math.max(1, limit))).all().catch(() => ({ results: [] }))).results || [];
}

export async function activeLicenseOptions(db) {
  const now = nowS();
  return (await db.prepare(
    `SELECT id,license_uid,label FROM mak_licenses
      WHERE status='ACTIVE' AND (expires_at IS NULL OR expires_at>?) ORDER BY label,license_uid LIMIT 300`,
  ).bind(now).all().catch(() => ({ results: [] }))).results || [];
}

export async function hostCounts(db) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status='SUSPENDED' THEN 1 ELSE 0 END) AS suspended
       FROM mak_hosts`,
  ).first().catch(() => null);
  return { total: Number(row?.total || 0), active: Number(row?.active || 0), suspended: Number(row?.suspended || 0) };
}

export async function deviceCounts(db) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status='REVOKED' THEN 1 ELSE 0 END) AS revoked
       FROM mak_devices`,
  ).first().catch(() => null);
  return { total: Number(row?.total || 0), active: Number(row?.active || 0), revoked: Number(row?.revoked || 0) };
}

export async function sessionCounts(db) {
  const now = nowS();
  const row = await db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='ACTIVE' AND expires_at>? THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status='ACTIVE' AND expires_at<=? THEN 1 ELSE 0 END) AS expired,
            SUM(CASE WHEN status='REVOKED' THEN 1 ELSE 0 END) AS revoked
       FROM mak_sessions`,
  ).bind(now, now).first().catch(() => null);
  return {
    total: Number(row?.total || 0), active: Number(row?.active || 0),
    expired: Number(row?.expired || 0), revoked: Number(row?.revoked || 0),
  };
}

export async function eventCounts(db) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN result='ALLOW' THEN 1 ELSE 0 END) AS allow_count,
            SUM(CASE WHEN result='DENY' THEN 1 ELSE 0 END) AS deny_count,
            SUM(CASE WHEN result='ERROR' THEN 1 ELSE 0 END) AS error_count,
            SUM(CASE WHEN result='INFO' THEN 1 ELSE 0 END) AS info_count
       FROM mak_events`,
  ).first().catch(() => null);
  return {
    total: Number(row?.total || 0), allow: Number(row?.allow_count || 0),
    deny: Number(row?.deny_count || 0), error: Number(row?.error_count || 0),
    info: Number(row?.info_count || 0),
  };
}

export async function guestCounts(db) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status='SUSPENDED' THEN 1 ELSE 0 END) AS suspended
       FROM mak_guest_apps`,
  ).first().catch(() => null);
  return { total: Number(row?.total || 0), active: Number(row?.active || 0), suspended: Number(row?.suspended || 0) };
}

// ---------------------------------------------------------------------------
// Revocations ledger
// ---------------------------------------------------------------------------
export async function recordRevocation(db, targetType, targetId, reason, actor = 'ADMIN') {
  await db.prepare(
    'INSERT INTO mak_revocations (target_type,target_id,reason,actor,created_at) VALUES (?,?,?,?,?)',
  ).bind(String(targetType), String(targetId), String(reason || '').slice(0, 300), String(actor || 'ADMIN').slice(0, 80), nowS())
    .run().catch(() => {});
}
