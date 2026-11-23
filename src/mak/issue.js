// MAK issuance helpers for the clean SDK Generate MAK form.
//
// The form supports:
//   - optional custom MAK (blank = random)
//   - duration dropdown
//   - max host packages / max apps per package / max installs per package
//   - Signature Bind Yes/No (per-app signing certificate enforcement)
//   - AUTO / MANUAL host binding
//   - optional host + guest app rows, each with its own signature

import {
  clampInt, generateLicenseUid, generateMak, makHash,
  normalizeHex64, nowS, validPackageName,
} from './crypto.js';
import {
  createLicenseRecord, bindGuest, findHostForLicensePackage, getLicenseByHash,
  listAllActiveGuests,
} from './store.js';
import { createGuestV2 } from './store-v2.js';

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

  const expiresOn = String(sp.get('expires_on') || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return { error: 'Choose a valid expiry date.' };
  const parsed = Date.parse(expiresOn + 'T23:59:59+05:30');
  if (!Number.isFinite(parsed)) return { error: 'Expiry date is invalid.' };
  const expiresAt = Math.floor(parsed / 1000);
  if (expiresAt <= nowS() + 60) return { error: 'Expiry must be in the future (IST end of day).' };
  return { expiresAt };
}

function yes(value, fallback = true) {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return fallback;
  return ['1', 'yes', 'true', 'on', 'y'].includes(s);
}

function parseGuestRows(sp, signatureBind) {
  const packages = sp.getAll('guest_package');
  const names = sp.getAll('guest_app_name');
  const certs = sp.getAll('guest_cert');
  const rows = [];
  const seen = new Set();
  const count = Math.max(packages.length, names.length, certs.length);
  for (let i = 0; i < count; i++) {
    const packageName = String(packages[i] || '').trim();
    const appName = String(names[i] || '').trim().slice(0, 120);
    const cert = normalizeHex64(certs[i]);
    if (!packageName && !appName && !cert) continue;
    if (!validPackageName(packageName)) {
      return { error: 'Guest package name is malformed (row ' + (i + 1) + ').' };
    }
    if (signatureBind && !cert) {
      return { error: 'Signature Bind is ON: guest signature is required for ' + packageName + '.' };
    }
    const key = packageName + '|' + cert;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ package_name: packageName, app_name: appName, cert_sha256: cert });
  }
  return { rows };
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

  const maxDevices = clampInt(sp.get('max_devices'), 1, 100, 1);
  const maxActivations = clampInt(sp.get('max_activations'), 1, 1000, 1);
  const sessionTtl = clampInt(sp.get('session_ttl'), 300, 86400, 3600);
  const maxPackages = clampInt(sp.get('max_packages'), 1, 100, 1);
  const maxApps = clampInt(sp.get('max_apps'), 1, 100, 2);
  const maxInstalls = clampInt(sp.get('max_installs'), 1, 100, 3);
  if (!maxDevices || !maxActivations || !sessionTtl || !maxPackages || !maxApps || !maxInstalls) {
    return { error: 'One or more limits are outside the allowed range.' };
  }
  if (maxActivations < maxDevices) return { error: 'Max activations must be at least max devices.' };

  const signatureBind = yes(sp.get('signature_bind'), true);
  const hostPackage = String(sp.get('host_package') || '').trim();
  const hostCert = normalizeHex64(sp.get('host_cert'));
  const hostAppName = String(sp.get('host_app_name') || '').trim().slice(0, 120);
  let host = null;
  if (hostPackage || hostCert || hostAppName) {
    if (!validPackageName(hostPackage)) return { error: 'Host package name is malformed.' };
    if (signatureBind && !hostCert) return { error: 'Signature Bind is ON: host signature is required.' };
    host = { package_name: hostPackage, app_name: hostAppName, cert_sha256: signatureBind ? hostCert : '' };
  }

  const modeRaw = String(sp.get('manual_bind') ? 'MANUAL' : (sp.get('host_bind_mode') || '')).toUpperCase();
  const hostBindMode = ['MANUAL', 'STRICT'].includes(modeRaw) ? 'MANUAL'
    : ['AUTO', 'FIRST_USE', ''].includes(modeRaw) ? 'AUTO' : '';
  if (!hostBindMode) return { error: 'Choose AUTO or MANUAL binding mode.' };
  if (hostBindMode === 'MANUAL' && !host && !opts.hasHost) {
    return { error: 'MANUAL mode requires a pre-registered host package and signature.' };
  }

  const guestRows = parseGuestRows(sp, signatureBind);
  if (guestRows.error) return { error: guestRows.error };

  const guestIds = [...new Set(sp.getAll('guest_ids').map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))];

  const policy = {
    label, user_ref: userRef, notes, expires_at: expiry.expiresAt,
    max_devices: maxDevices, max_activations: maxActivations,
    session_ttl: sessionTtl,
    max_packages: maxPackages,
    max_apps: maxApps,
    max_installs: maxInstalls,
    signature_bind: signatureBind ? 1 : 0,
    host_bind_mode: hostBindMode,
  };

  return { policy, host, guests: guestRows.rows, guestIds };
}

export async function issueMak(db, sp, createdBy) {
  const parsed = parseLicensePolicy(sp);
  if (parsed.error) return { error: parsed.error };

  const customRaw = String(sp.get('custom_key') || '').trim().slice(0, 120);
  let credential;
  if (customRaw) {
    credential = customRaw;
  } else {
    credential = generateMak();
  }
  const credentialHash = await makHash(credential);
  if (customRaw) {
    const existing = await getLicenseByHash(db, credentialHash);
    if (existing) return { error: 'This custom MAK is already in use. Choose another key.' };
  }

  const guests = await listAllActiveGuests(db);
  const validGuestIds = new Set(guests.map((g) => Number(g.id)));
  const guestIds = parsed.guestIds.filter((id) => validGuestIds.has(id));

  const licenseUid = generateLicenseUid();
  let licenseId;
  try {
    licenseId = await createLicenseRecord(db, {
      license_uid: licenseUid,
      credential_hash: credentialHash,
      credential_plain: credential,
      ...parsed.policy,
      host: parsed.host,
      guest_ids: guestIds,
      created_by: createdBy || null,
    });
  } catch (err) {
    if (/UNIQUE|constraint/i.test(String(err))) {
      return { error: 'This MAK is already in use. Choose another key.' };
    }
    throw err;
  }

  // Pre-registered guest rows: one signature per app row. AUTO mode may leave
  // them empty; MANUAL mode requires them at issuance time.
  let hostId = 0;
  if (parsed.host?.package_name) {
    const hostRow = await findHostForLicensePackage(db, licenseId, parsed.host.package_name);
    hostId = Number(hostRow?.id || 0);
  }
  for (const row of parsed.guests) {
    const guest = await createGuestV2(db, {
      package_name: row.package_name,
      app_name: row.app_name,
      apk_sha256: '',
      cert_sha256: parsed.policy.signature_bind ? row.cert_sha256 : '',
      version_code: 0,
    });
    if (guest?.id) {
      await bindGuest(db, licenseId, guest.id, { install: true, launch: true, update: true, restart: true }, hostId);
    }
  }

  return { credential, licenseId, licenseUid };
}

export function defaultExpiryDate(days = 30) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}
