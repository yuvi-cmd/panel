// Shared MAK issuance helpers. Both the SDK Generate MAK page (/sdk/generate) and the
// SDK Panel's Generate MAK page (/sdk/generate) use this module, so validation
// and credential handling stay identical.

import {
  canonicalMak, clampInt, generateLicenseUid, generateMak, makHash,
  normalizeHex64, nowS, validPackageName,
} from './crypto.js';
import { createLicenseRecord, listAllActiveGuests } from './store.js';

export function parseLicensePolicy(sp) {
  const label = String(sp.get('label') || '').trim();
  if (!label || label.length > 80) return { error: 'Label is required and must be 80 characters or fewer.' };
  const userRef = String(sp.get('user_ref') || '').trim().slice(0, 120);
  const notes = String(sp.get('notes') || '').trim().slice(0, 1000);
  const expiresOn = String(sp.get('expires_on') || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return { error: 'Choose a valid expiry date.' };
  const parsed = Date.parse(expiresOn + 'T23:59:59+05:30');
  if (!Number.isFinite(parsed)) return { error: 'Expiry date is invalid.' };
  const expiresAt = Math.floor(parsed / 1000);
  if (expiresAt <= nowS() + 60) return { error: 'Expiry must be in the future (IST end of day).' };

  const maxDevices = clampInt(sp.get('max_devices'), 1, 100, 0);
  const maxActivations = clampInt(sp.get('max_activations'), 1, 1000, 0);
  const sessionTtl = clampInt(sp.get('session_ttl'), 300, 86400, 0);
  if (!maxDevices || !maxActivations || !sessionTtl) {
    return { error: 'Device, activation or session limits are outside the allowed range.' };
  }
  if (maxActivations < maxDevices) return { error: 'Max activations must be at least max devices.' };

  const hostPackage = String(sp.get('host_package') || '').trim();
  const hostCert = normalizeHex64(sp.get('host_cert'));
  let host = null;
  if (hostPackage || hostCert) {
    if (!validPackageName(hostPackage)) return { error: 'Host package name is malformed.' };
    if (!hostCert) return { error: 'Host signing certificate SHA-256 must be 64 hex characters.' };
    host = { package_name: hostPackage, cert_sha256: hostCert };
  }

  const mode = String(sp.get('host_bind_mode') || '').toUpperCase();
  const hostBindMode = mode === 'STRICT' ? 'STRICT' : mode === 'FIRST_USE' ? 'FIRST_USE' : '';
  if (hostBindMode === 'STRICT' && !host) {
    return { error: 'Strict host mode requires a pre-registered host package and certificate.' };
  }

  const guestIds = [...new Set(sp.getAll('guest_ids').map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))];

  const policy = {
    label, user_ref: userRef, notes, expires_at: expiresAt,
    max_devices: maxDevices, max_activations: maxActivations,
    session_ttl: sessionTtl,
  };
  if (hostBindMode) policy.host_bind_mode = hostBindMode;

  return { policy, host, guestIds };
}

export async function issueMak(db, sp, createdBy) {
  const parsed = parseLicensePolicy(sp);
  if (parsed.error) return { error: parsed.error };

  const guests = await listAllActiveGuests(db);
  const validGuestIds = new Set(guests.map((g) => Number(g.id)));
  const guestIds = parsed.guestIds.filter((id) => validGuestIds.has(id));

  const credential = generateMak();
  const credentialHash = await makHash(canonicalMak(credential));
  const licenseUid = generateLicenseUid();
  const licenseId = await createLicenseRecord(db, {
    license_uid: licenseUid,
    credential_hash: credentialHash,
    ...parsed.policy,
    host: parsed.host,
    guest_ids: guestIds,
    created_by: createdBy || null,
  });
  return { credential, licenseId, licenseUid };
}

export function defaultExpiryDate(days = 30) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}
