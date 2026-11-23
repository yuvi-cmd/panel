// Security/audit event writer. Raw MAK credentials and device proofs must
// never reach this module.

import { nowS } from './crypto.js';

function clip(value, max = 600) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
}

export async function logEvent(db, e) {
  try {
    await db.prepare(
      `INSERT INTO mak_events
       (license_id,device_id,host_id,guest_app_id,event_type,result,error_code,device_uid,detail,actor,request_id,ip_hash,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      e.license_id || null,
      e.device_id || null,
      e.host_id || null,
      e.guest_app_id || null,
      clip(e.event_type || 'UNKNOWN', 64),
      clip(e.result || 'INFO', 16),
      clip(e.error_code || '', 64),
      clip(e.device_uid || '', 128),
      clip(e.detail || '', 700),
      clip(e.actor || 'CLIENT', 80),
      clip(e.request_id || '', 96),
      clip(e.ip_hash || '', 64),
      e.created_at || nowS(),
    ).run();
  } catch (err) {
    // Audit failures must not take down the auth path. Surface in Worker logs.
    console.error('mak_event_write_failed', String(err));
  }
}

export async function recentEvents(db, limit = 8) {
  return (await db.prepare(
    `SELECT e.*, l.label AS license_label, l.license_uid
       FROM mak_events e LEFT JOIN mak_licenses l ON l.id=e.license_id
      ORDER BY e.id DESC LIMIT ?`,
  ).bind(Math.min(100, Math.max(1, limit))).all().catch(() => ({ results: [] }))).results || [];
}

export async function licenseEvents(db, licenseId, limit = 12) {
  return (await db.prepare(
    `SELECT * FROM mak_events WHERE license_id=? ORDER BY id DESC LIMIT ?`,
  ).bind(licenseId, Math.min(100, Math.max(1, limit))).all().catch(() => ({ results: [] }))).results || [];
}

export async function listEvents(db, opts = {}) {
  const where = [];
  const args = [];
  if (opts.type) { where.push('e.event_type=?'); args.push(opts.type); }
  if (opts.result) { where.push('e.result=?'); args.push(opts.result); }
  if (opts.license) { where.push('e.license_id=?'); args.push(opts.license); }
  const q = String(opts.q || '').trim();
  if (q) {
    where.push('(e.event_type LIKE ? OR e.error_code LIKE ? OR e.detail LIKE ? OR l.label LIKE ? OR l.license_uid LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like, like);
  }
  const sql = `SELECT e.*, l.label AS license_label, l.license_uid
                 FROM mak_events e LEFT JOIN mak_licenses l ON l.id=e.license_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY e.id DESC LIMIT ?`;
  args.push(Math.min(300, Math.max(1, opts.limit || 100)));
  return (await db.prepare(sql).bind(...args).all().catch(() => ({ results: [] }))).results || [];
}

export async function eventTypes(db) {
  return (await db.prepare('SELECT DISTINCT event_type FROM mak_events ORDER BY event_type').all().catch(() => ({ results: [] }))).results.map((r) => r.event_type);
}
