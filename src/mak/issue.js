// Shared MAK issuance helpers. Both the SDK Generate MAK page (/sdk/generate) and the
// SDK Panel's Generate MAK page (/sdk/generate) use this module, so validation
// and credential handling stay identical.

import {
  canonicalMak, clampInt, generateLicenseUid, generateMak, makHash,
  normalizeHex64, nowS, validPackageName,
} from './crypto.js';
import { createLicenseRecord, listAllActiveGuests } from './store.js';

// Duration is a dropdown in the panel. Values are days; "lifetime" removes the
// expiry, and "custom" falls back to the date picker (IST end of day).
export const DURATION_OPTIONS = [
  { value: '1', label: '1 day' },
  { value: '3', label: '3 days' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '365', label: '1 year' },
  { value: '730', label: '2 years' },
  { value: 'lifetime', label: 'Lifetime (no expiry)' },
  { value: 'custom', label: 'Custom date…' },
];

function resolveExpiry(sp) {
  const raw = String(sp.get('duration') || '').trim().toLowerCase();
  if (raw === 'lifetime' || raw === 'never') return { expiresAt: null };
  if (raw && /^\d+$/.test(raw)) {
    const days = Number(raw);
    if (days < 1 || days > 3650) return { error: 'Duration must be between 1 and 3650 days.' };
    return { expiresAt: nowS() + days * 86400 };
  }
  if (raw && raw !== 'custom') return { error: 'Choose a valid duration.' };

  // Backward compatible path: custom date or an old form without `duration`.
  const expiresOn = String(sp.get('expires_on') || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return { error: 'Choose a valid expiry date.' };
  const parsed = Date.parse(expiresOn + 'T23:59:59+05:30');
  if (!Number.isFinite(parsed)) return { error: 'Expiry date is invalid.' };
  const expiresAt = Math.floor(parsed / 1000);
  if (expiresAt <= nowS() + 60) return { error: 'Expiry must be in the future (IST end of day).' };
  return { expiresAt };
}

// opts.hasHost lets the license edit form keep MANUAL mode without re-entering
// the host package that is already registered.
export function parseLicensePolicy(sp, opts = {}) {
  const label = String(sp.get('label') || '').trim();
  if (!label || label.length > 80) return { error: 'Label is required and must be 80 characters or fewer.' };
  const userRef = String(sp.get('user_ref') || '').trim().slice(0, 120);
  const notes = String(sp.get('notes') || '').trim().slice(0, 1000);

  const expiry = resolveExpiry(sp);
  if (expiry.error) return { error: expiry.error };

  const maxDevices = clampInt(sp.get('max_devices'), 1, 100, 0);
  const maxActivations = clampInt(sp.get('max_activations'), 1, 1000, 0);
  const sessionTtl = clampInt(sp.get('session_ttl'), 300, 86400, 0);
  const maxPackages = clampInt(sp.get('max_packages'), 1, 100, 1);
  const maxApps = clampInt(sp.get('max_apps'), 1, 100, 2);
  if (!maxDevices || !maxActivations || !sessionTtl || !maxPackages || !maxApps) {
    return { error: 'Device, activation, session, package or app limits are outside the allowed range.' };
  }
  if (maxActivations < maxDevices) return { error: 'Max activations must be at least max devices.' };

  const hostPackage = String(sp.get('host_package') || '').trim();
  const hostCert = normalizeHex64(sp.get('host_cert'));
  const hostAppName = String(sp.get('host_app_name') || '').trim().slice(0, 120);
  let host = null;
  if (hostPackage || hostCert) {
    if (!validPackageName(hostPackage)) return { error: 'Host package name is malformed.' };
    if (!hostCert) return { error: 'Host signing certificate SHA-256 must be 64 hex characters.' };
    host = { package_name: hostPackage, app_name: hostAppName, cert_sha256: hostCert };
  }

  // AUTO: a new host package binds on first authenticated use, up to
  // max_packages. MANUAL: only pre-registered packages may bind.
  const modeRaw = String(sp.get('host_bind_mode') || '').toUpperCase();
  const hostBindMode = ['MANUAL', 'STRICT'].includes(modeRaw) ? 'MANUAL'
    : ['AUTO', 'FIRST_USE', ''].includes(modeRaw) ? 'AUTO' : '';
  if (!hostBindMode) return { error: 'Choose AUTO or MANUAL binding mode.' };
  if (hostBindMode === 'MANUAL' && !host && !opts.hasHost) {
    return { error: 'MANUAL mode requires a pre-registered host package and certificate.' };
  }

  const guestIds = [...new Set(sp.getAll('guest_ids').map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))];

  const policy = {
    label, user_ref: userRef, notes, expires_at: expiry.expiresAt,
    max_devices: maxDevices, max_activations: maxActivations,
    session_ttl: sessionTtl,
    max_packages: maxPackages,
    max_apps: maxApps,
    host_bind_mode: hostBindMode,
  };

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
