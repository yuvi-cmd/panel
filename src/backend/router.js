// HTTP router for the MAK control panel. Panel pages are server-rendered;
// MAK/1 protocol endpoints are dispatched to backend/mak.js before any panel
// session logic. Every mutating panel request requires same-origin + CSRF.

import {
  adminClearCookie, adminCookie, adminCount, createAdmin, createAdminSession,
  destroyAdminSession, destroyOtherAdminSessions, findAdminByUsername,
  getAdminSession, setAdminPassword, setupRequired, verifyAdminLogin, verifyCsrf,
} from './auth.js';
import {
  canonicalMak, clampInt, generateLicenseUid, generateMak, hashIp,
  loadSigningConfig, makHash, normalizeHex64, nowS, signingPublicKeys,
  validPackageName, verifyPassword,
} from './crypto.js';
import { ensureDB, getSettings, setSettings } from './db.js';
import {
  eventTypes, licenseEvents, listEvents, logEvent, recentEvents,
} from './events.js';
import {
  SECURITY_HEADERS, clientIp, flashRedirect, formAll, html, redirect,
  sameOrigin, text,
} from './http.js';
import { handleMak } from './mak.js';
import { hitRate } from './rate.js';
import {
  activeLicenseOptions, bindGuest, createGuest, createLicenseRecord, dashboardStats,
  deleteDevice, deleteHost, deviceCounts, devicesForLicense, eventCounts, expiringLicenses,
  getDeviceById, getGuestById, getHostForLicense, getLicenseById, getSession,
  guestCounts, guestEvents, hostCounts, licenseCounts, listAllActiveGuests,
  listBindingsForGuest, listBindingsForLicense, listDevices, listGuests, listHosts,
  listLicenses, listSessions, revokeAllSessions, revokeDevice, revokeLicense,
  revokeSession, revokeSessionsForLicense, resetLicenseDevices,
  rotateLicenseCredential, sessionCounts, sessionsForLicense, setHostStatus,
  setLicenseStatus, unbindGuest, updateGuest, updateLicensePolicy, upsertHost,
} from './store.js';
import { authPage } from '../frontend/pages/auth.js';
import { dashboardPage } from '../frontend/pages/dashboard.js';
import { devicesPage } from '../frontend/pages/devices.js';
import { guestsPage, guestDetailPage, newGuestPage } from '../frontend/pages/guests.js';
import {
  licenseDetailPage, licensesPage, newLicensePage, revealLicensePage,
} from '../frontend/pages/licenses.js';
import { logsPage } from '../frontend/pages/logs.js';
import { hostsPage } from '../frontend/pages/hosts.js';
import { sessionsPage } from '../frontend/pages/sessions.js';
import { settingsPage } from '../frontend/pages/settings.js';
import { emptyState, icon, layout, pageHeader } from '../frontend/ui.js';

const PANEL_DEFAULT = 'MUNDO MAK';
const FLASH_MAX = 380;

function clipFlash(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, FLASH_MAX);
}

function panelName(env) { return String(env.PANEL_NAME || PANEL_DEFAULT); }

function routePath(request) {
  const path = new URL(request.url).pathname;
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function redirectWith(location, headers = {}, status = 303) {
  return new Response(null, {
    status,
    headers: { Location: location, 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers },
  });
}

function loginRedirect(request) {
  const url = new URL(request.url);
  const next = url.pathname + (url.search || '');
  return redirect('/login?next=' + encodeURIComponent(next));
}

function panelResponse(env, request, admin, session, settings, config, opts = {}) {
  const url = new URL(request.url);
  return html(layout({
    title: opts.title || 'Panel',
    active: opts.active || '',
    admin,
    server: { enabled: settings.server_enabled },
    csrf: session.csrf,
    signingReady: config.ok,
    panelName: panelName(env),
    version: settings.server_version,
    ok: opts.ok ?? clipFlash(url.searchParams.get('ok')),
    err: opts.err ?? clipFlash(url.searchParams.get('err')),
    content: opts.content || '',
  }), opts.status || 200);
}

function notFoundResponse(env, request, admin, session, settings, config, message = 'The page or record you requested does not exist.') {
  return panelResponse(env, request, admin, session, settings, config, {
    title: 'Not found',
    status: 404,
    content: `${pageHeader({ eyebrow: '404', title: 'Not found', subtitle: message })}
      ${emptyState('search', 'Nothing here', 'Check the address, or go back to the overview.', `<a class="btn btn-primary" href="/dashboard">${icon('grid', 15)} Dashboard</a>`)}`,
  });
}

function authResponse(env, { mode = 'login', error = '', ok = '', status = 200, next = '' } = {}) {
  return html(authPage({
    mode,
    panelName: panelName(env),
    error,
    ok,
    next,
    setupCodeRequired: !!env.SETUP_CODE,
  }), status);
}

function readPolicy(sp) {
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

function readGuestIdentity(sp) {
  const packageName = validPackageName(sp.get('package_name'));
  if (!packageName) return { error: 'Package name is malformed (example: com.example.guest).' };
  const apkHash = normalizeHex64(sp.get('apk_sha256'));
  if (!apkHash) return { error: 'APK SHA-256 must be 64 hex characters.' };
  const certHash = normalizeHex64(sp.get('cert_sha256'));
  if (!certHash) return { error: 'Signing certificate SHA-256 must be 64 hex characters.' };
  const versionCode = clampInt(sp.get('version_code'), 0, 2147483647, -1);
  if (versionCode < 0) return { error: 'Version code must be a non-negative integer.' };
  const appName = String(sp.get('app_name') || '').trim().slice(0, 120);
  return { guest: { package_name: packageName, app_name: appName, apk_sha256: apkHash, cert_sha256: certHash, version_code: versionCode } };
}

function permissionsFrom(sp) {
  return {
    install: sp.has('perm_install'),
    launch: sp.has('perm_launch'),
    update: sp.has('perm_update'),
    restart: sp.has('perm_restart'),
  };
}

function defaultExpiryDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
    .format(new Date(Date.now() + 30 * 86400000));
}

function signingView(config) {
  return {
    ok: config.ok,
    reason: config.reason,
    keys: signingPublicKeys(config),
    active: config.ok ? { key_id: config.active.key_id } : null,
  };
}

export async function handleRequest(request, env) {
  const db = env.DB;
  if (!db) return text('Database binding DB is not configured.', 500);
  await ensureDB(db);

  const mak = await handleMak(request, env, db);
  if (mak) return mak;

  const path = routePath(request);
  const method = request.method.toUpperCase();
  const config = loadSigningConfig(env);
  const settings = await getSettings(db);
  const ip = clientIp(request);
  const ipHash = await hashIp(ip, env);

  if (path === '/favicon.ico') return new Response(null, { status: 204 });

  // -------------------------------------------------------------------------
  // First-run setup + authentication
  // -------------------------------------------------------------------------
  if (path === '/' && method === 'GET') {
    const session = await getAdminSession(db, request);
    return redirect(session ? '/dashboard' : '/login');
  }

  if (path === '/setup') {
    if (!(await setupRequired(db))) return redirect('/login');
    if (method === 'GET') {
      return authResponse(env, { mode: 'setup' });
    }
    if (method !== 'POST') return text('Method not allowed', 405, { Allow: 'GET, POST' });
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    let sp;
    try { sp = await formAll(request); } catch { return authResponse(env, { mode: 'setup', error: 'The form could not be read.', status: 400 }); }
    if (env.SETUP_CODE && String(sp.get('setup_code') || '') !== String(env.SETUP_CODE)) {
      return authResponse(env, { mode: 'setup', error: 'Setup code is incorrect.' });
    }
    const username = String(sp.get('username') || '').trim();
    const password = String(sp.get('password') || '');
    const confirm = String(sp.get('confirm_password') || '');
    if (!/^[A-Za-z0-9_.-]{3,48}$/.test(username)) {
      return authResponse(env, { mode: 'setup', error: 'Username must be 3–48 letters, numbers, dot, dash or underscore.' });
    }
    if (password.length < 10 || password.length > 200) {
      return authResponse(env, { mode: 'setup', error: 'Password must be between 10 and 200 characters.' });
    }
    if (password !== confirm) {
      return authResponse(env, { mode: 'setup', error: 'Passwords do not match.' });
    }
    if (!(await setupRequired(db))) return redirect('/login');
    try {
      const admin = await createAdmin(db, { username, password });
      const session = await createAdminSession(db, admin.id);
      await logEvent(db, { event_type: 'ADMIN_SETUP', result: 'SUCCESS', actor: username, ip_hash: ipHash, detail: 'Owner account created' });
      return redirectWith('/dashboard', { 'Set-Cookie': adminCookie(request, session.token) });
    } catch (err) {
      return authResponse(env, { mode: 'setup', error: 'Could not create the administrator. Try a different username.', status: 400 });
    }
  }

  if (path === '/login') {
    if (await setupRequired(db)) return redirect('/setup');
    if (method === 'GET') {
      const session = await getAdminSession(db, request);
      if (session) return redirect('/dashboard');
      const next = new URL(request.url).searchParams.get('next') || '';
      const safe = next.startsWith('/') && !next.startsWith('//') ? next : '';
      return authResponse(env, { mode: 'login', next: safe });
    }
    if (method !== 'POST') return text('Method not allowed', 405, { Allow: 'GET, POST' });
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    const rl = hitRate('admin-login:' + ip, 12, 60_000);
    if (!rl.allowed) {
      return authResponse(env, { mode: 'login', error: 'Too many sign-in attempts. Try again in a minute.', status: 429 });
    }
    let sp;
    try { sp = await formAll(request); } catch { return authResponse(env, { mode: 'login', error: 'The form could not be read.', status: 400 }); }
    const nextRaw = new URL(request.url).searchParams.get('next') || sp.get('next') || '';
    const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/dashboard';
    const username = String(sp.get('username') || '').trim();
    const password = String(sp.get('password') || '');
    const userLimit = hitRate('admin-login-user:' + username.toLowerCase(), 7, 60_000);
    if (!userLimit.allowed) {
      return authResponse(env, { mode: 'login', error: 'Too many attempts for this account. Try again shortly.', status: 429, next });
    }
    const admin = await verifyAdminLogin(db, username, password);
    if (!admin) {
      await logEvent(db, { event_type: 'ADMIN_LOGIN', result: 'DENY', error_code: 'INVALID_CREDENTIALS', actor: username.slice(0, 80), ip_hash: ipHash, detail: 'Panel sign-in failed' });
      return authResponse(env, { mode: 'login', error: 'Invalid username or password.', status: 401, next });
    }
    const session = await createAdminSession(db, admin.id);
    await logEvent(db, { event_type: 'ADMIN_LOGIN', result: 'SUCCESS', actor: admin.username, ip_hash: ipHash, detail: 'Panel sign-in succeeded' });
    return redirectWith(next, { 'Set-Cookie': adminCookie(request, session.token) });
  }

  // Every route below requires an administrator session.
  const session = await getAdminSession(db, request);
  if (!session) return loginRedirect(request);

  if (path === '/logout' && method === 'POST') {
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    let sp;
    try { sp = await formAll(request); } catch { sp = new URLSearchParams(); }
    if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
    await destroyAdminSession(db, request);
    await logEvent(db, { event_type: 'ADMIN_LOGOUT', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Panel sign-out' });
    return redirectWith('/login', { 'Set-Cookie': adminClearCookie() });
  }

  // -------------------------------------------------------------------------
  // Overview
  // -------------------------------------------------------------------------
  if (path === '/dashboard' && method === 'GET') {
    const [stats, recent, expiring, counts] = await Promise.all([
      dashboardStats(db), recentEvents(db, 8), expiringLicenses(db), licenseCounts(db),
    ]);
    const server = {
      enabled: settings.server_enabled,
      keyId: config.ok ? config.active.key_id : '',
      guestProofRequired: settings.guest_proof_required,
      sessionTtl: settings.session_ttl,
      heartbeatInterval: settings.heartbeat_interval,
    };
    return panelResponse(env, request, session, session, settings, config, {
      title: 'Overview',
      active: 'dashboard',
      content: dashboardPage({
        admin: session, csrf: session.csrf, server, signingReady: config.ok,
        signingReason: config.reason, announcement: settings.announcement,
        stats, recent, expiring, counts,
      }),
    });
  }

  // -------------------------------------------------------------------------
  // Licenses
  // -------------------------------------------------------------------------
  if (path === '/licenses' && method === 'GET') {
    const q = String(new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120);
    const status = String(new URL(request.url).searchParams.get('status') || 'ALL').toUpperCase();
    const [licenses, counts] = await Promise.all([listLicenses(db, { q, status }), licenseCounts(db)]);
    return panelResponse(env, request, session, session, settings, config, {
      title: 'Licenses',
      active: 'licenses',
      content: licensesPage({ licenses, counts, q, status, csrf: session.csrf, server: { enabled: settings.server_enabled } }),
    });
  }

  if (path === '/licenses/new') {
    if (method === 'GET') {
      const guests = await listAllActiveGuests(db);
      return panelResponse(env, request, session, session, settings, config, {
        title: 'Issue MAK',
        active: 'licenses',
        content: newLicensePage({
          csrf: session.csrf, guests, defaultExpiry: defaultExpiryDate(),
          server: { enabled: settings.server_enabled, signingReady: config.ok },
        }),
      });
    }
    if (method !== 'POST') return text('Method not allowed', 405, { Allow: 'GET, POST' });
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    const sp = await formAll(request);
    if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
    const values = {
      label: String(sp.get('label') || ''),
      user_ref: String(sp.get('user_ref') || ''),
      expires_on: String(sp.get('expires_on') || ''),
      max_devices: String(sp.get('max_devices') || ''),
      max_activations: String(sp.get('max_activations') || ''),
      session_ttl: String(sp.get('session_ttl') || ''),
      host_package: String(sp.get('host_package') || ''),
      host_cert: String(sp.get('host_cert') || ''),
      host_bind_mode: String(sp.get('host_bind_mode') || 'FIRST_USE'),
      notes: String(sp.get('notes') || ''),
      guest_ids: sp.getAll('guest_ids'),
    };
    const parsed = readPolicy(sp);
    const guests = await listAllActiveGuests(db);
    if (parsed.error) {
      return panelResponse(env, request, session, session, settings, config, {
        title: 'Issue MAK',
        active: 'licenses',
        status: 400,
        content: newLicensePage({
          csrf: session.csrf, guests, error: parsed.error, values,
          defaultExpiry: defaultExpiryDate(),
          server: { enabled: settings.server_enabled, signingReady: config.ok },
        }),
      });
    }
    const validGuestIds = new Set(guests.map((g) => Number(g.id)));
    const guestIds = parsed.guestIds.filter((id) => validGuestIds.has(id));
    const credential = generateMak();
    const canonical = canonicalMak(credential);
    const credentialHash = await makHash(canonical);
    const licenseUid = generateLicenseUid();
    let licenseId = 0;
    try {
      licenseId = await createLicenseRecord(db, {
        license_uid: licenseUid,
        credential_hash: credentialHash,
        ...parsed.policy,
        host: parsed.host,
        guest_ids: guestIds,
        created_by: session.id,
      });
    } catch (err) {
      return panelResponse(env, request, session, session, settings, config, {
        title: 'Issue MAK',
        active: 'licenses',
        status: 500,
        content: newLicensePage({
          csrf: session.csrf, guests, error: 'Could not persist the license. Try again.', values,
          defaultExpiry: defaultExpiryDate(),
          server: { enabled: settings.server_enabled, signingReady: config.ok },
        }),
      });
    }
    const license = await getLicenseById(db, licenseId);
    await logEvent(db, {
      license_id: licenseId, event_type: 'LICENSE_ISSUED', result: 'SUCCESS',
      actor: session.username, ip_hash: ipHash,
      detail: 'MAK issued for ' + (licenseUid || 'license'),
    });
    return panelResponse(env, request, session, session, settings, config, {
      title: 'MAK issued',
      active: 'licenses',
      content: revealLicensePage({
        license, credential, csrf: session.csrf,
        server: { enabled: settings.server_enabled },
      }),
    });
  }

  if (path.startsWith('/licenses/')) {
    const parts = path.split('/').filter(Boolean);
    const id = Number(parts[1]);
    if (!Number.isInteger(id) || id <= 0) {
      return notFoundResponse(env, request, session, session, settings, config);
    }

    if (parts.length === 2 && method === 'GET') {
      const license = await getLicenseById(db, id);
      if (!license) return notFoundResponse(env, request, session, session, settings, config, 'That license does not exist.');
      const [host, bindings, allGuests, devices, sessions, events] = await Promise.all([
        getHostForLicense(db, id), listBindingsForLicense(db, id), listAllActiveGuests(db),
        devicesForLicense(db, id), sessionsForLicense(db, id), licenseEvents(db, id, 12),
      ]);
      return panelResponse(env, request, session, session, settings, config, {
        title: license.label || 'License',
        active: 'licenses',
        content: licenseDetailPage({
          license, host, bindings, allGuests, devices, sessions, events,
          csrf: session.csrf, server: { enabled: settings.server_enabled },
        }),
      });
    }

    if (parts.length === 3 && parts[2] === 'action' && method === 'POST') {
      if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
      const sp = await formAll(request);
      if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
      const license = await getLicenseById(db, id);
      if (!license) return notFoundResponse(env, request, session, session, settings, config, 'That license does not exist.');
      const action = String(sp.get('action') || '');
      const done = (message) => flashRedirect(`/licenses/${id}`, message);
      const fail = (message) => flashRedirect(`/licenses/${id}`, '', message);

      if (action === 'update_policy') {
        const parsed = readPolicy(sp);
        if (parsed.error) return fail(parsed.error);
        await updateLicensePolicy(db, id, parsed.policy);
        await logEvent(db, { license_id: id, event_type: 'LICENSE_UPDATED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'License policy updated' });
        return done('License policy saved.');
      }
      if (action === 'suspend' || action === 'reactivate') {
        await setLicenseStatus(db, id, action === 'suspend' ? 'SUSPENDED' : 'ACTIVE');
        await logEvent(db, { license_id: id, event_type: action === 'suspend' ? 'LICENSE_SUSPENDED' : 'LICENSE_REACTIVATED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'License status changed by administrator' });
        return done(action === 'suspend' ? 'License suspended. Sessions revoked.' : 'License reactivated.');
      }
      if (action === 'revoke') {
        await revokeLicense(db, id, 'Permanent revocation from panel', session.username);
        await logEvent(db, { license_id: id, event_type: 'LICENSE_REVOKED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'License permanently revoked' });
        return done('License revoked permanently.');
      }
      if (action === 'rotate') {
        const credential = generateMak();
        const canonical = canonicalMak(credential);
        await rotateLicenseCredential(db, id, await makHash(canonical));
        const refreshed = await getLicenseById(db, id);
        await logEvent(db, { license_id: id, event_type: 'CREDENTIAL_ROTATED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'MAK credential rotated; sessions revoked' });
        return panelResponse(env, request, session, session, settings, config, {
          title: 'MAK rotated',
          active: 'licenses',
          content: revealLicensePage({
            license: refreshed, credential, csrf: session.csrf,
            server: { enabled: settings.server_enabled },
          }),
        });
      }
      if (action === 'host_save') {
        const hostPackage = String(sp.get('host_package') || '').trim();
        const hostCert = normalizeHex64(sp.get('host_cert'));
        if (!validPackageName(hostPackage)) return fail('Host package name is malformed.');
        if (!hostCert) return fail('Host certificate must be 64 hex characters.');
        await upsertHost(db, id, { package_name: hostPackage, cert_sha256: hostCert });
        await revokeSessionsForLicense(db, id);
        await logEvent(db, { license_id: id, event_type: 'HOST_BOUND', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Host binding saved by administrator' });
        return done('Host binding saved. Sessions revoked.');
      }
      if (action === 'host_reset') {
        await deleteHost(db, id);
        await revokeSessionsForLicense(db, id);
        await logEvent(db, { license_id: id, event_type: 'HOST_RESET', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Host binding reset by administrator' });
        return done('Host binding reset.');
      }
      if (action === 'binding_add') {
        const guestId = Number(sp.get('guest_id') || 0);
        const guest = await getGuestById(db, guestId);
        if (!guest) return fail('Choose an approved guest app.');
        await bindGuest(db, id, guestId, permissionsFrom(sp));
        await logEvent(db, { license_id: id, guest_app_id: guestId, event_type: 'BINDING_ADDED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Guest bound to license' });
        return done('Guest app bound.');
      }
      if (action === 'binding_remove') {
        const guestId = Number(sp.get('guest_id') || 0);
        await unbindGuest(db, id, guestId);
        await logEvent(db, { license_id: id, guest_app_id: guestId, event_type: 'BINDING_REMOVED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Guest unbound from license' });
        return done('Guest access removed.');
      }
      if (action === 'device_revoke') {
        const device = await getDeviceById(db, Number(sp.get('device_id') || 0));
        if (!device || Number(device.license_id) !== id) return fail('Device not found for this license.');
        await revokeDevice(db, device.id, 'Revoked from license page', session.username);
        await logEvent(db, { license_id: id, device_id: device.id, event_type: 'DEVICE_REVOKED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Device revoked by administrator' });
        return done('Device revoked.');
      }
      if (action === 'device_delete') {
        const device = await getDeviceById(db, Number(sp.get('device_id') || 0));
        if (!device || Number(device.license_id) !== id) return fail('Device not found for this license.');
        await deleteDevice(db, device.id, session.username);
        await logEvent(db, { license_id: id, device_id: device.id, event_type: 'DEVICE_DELETED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Device row deleted by administrator' });
        return done('Device record deleted.');
      }
      if (action === 'session_revoke') {
        const target = await getSession(db, String(sp.get('session_id') || ''));
        if (!target || Number(target.license_id) !== id) return fail('Session not found for this license.');
        await revokeSession(db, target.session_id, 'Revoked from license page', session.username);
        await logEvent(db, { license_id: id, device_id: target.device_id, event_type: 'SESSION_REVOKED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Session revoked by administrator' });
        return done('Session revoked.');
      }
      if (action === 'devices_reset') {
        await resetLicenseDevices(db, id, session.username);
        await logEvent(db, { license_id: id, event_type: 'DEVICES_RESET', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'All devices reset by administrator' });
        return done('All active devices and sessions were reset.');
      }
      return fail('Unknown license action.');
    }
  }

  // -------------------------------------------------------------------------
  // Guest applications
  // -------------------------------------------------------------------------
  if (path === '/guests' && method === 'GET') {
    const q = String(new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120);
    const status = String(new URL(request.url).searchParams.get('status') || 'ALL').toUpperCase();
    const [guests, counts] = await Promise.all([listGuests(db, { q, status }), guestCounts(db)]);
    return panelResponse(env, request, session, session, settings, config, {
      title: 'Guest apps',
      active: 'guests',
      content: guestsPage({ guests, counts, q, status, csrf: session.csrf }),
    });
  }

  if (path === '/guests/new') {
    if (method === 'GET') {
      return panelResponse(env, request, session, session, settings, config, {
        title: 'Register guest',
        active: 'guests',
        content: newGuestPage({ csrf: session.csrf }),
      });
    }
    if (method !== 'POST') return text('Method not allowed', 405, { Allow: 'GET, POST' });
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    const sp = await formAll(request);
    if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
    const values = Object.fromEntries(sp.entries());
    const parsed = readGuestIdentity(sp);
    if (parsed.error) {
      return panelResponse(env, request, session, session, settings, config, {
        title: 'Register guest', active: 'guests', status: 400,
        content: newGuestPage({ csrf: session.csrf, error: parsed.error, values }),
      });
    }
    try {
      const id = await createGuest(db, parsed.guest);
      await logEvent(db, { guest_app_id: id, event_type: 'GUEST_REGISTERED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: parsed.guest.package_name + ' v' + parsed.guest.version_code });
      return flashRedirect(`/guests/${id}`, 'Guest app registered.');
    } catch (err) {
      return panelResponse(env, request, session, session, settings, config, {
        title: 'Register guest', active: 'guests', status: 409,
        content: newGuestPage({ csrf: session.csrf, error: 'This exact package, APK hash and certificate combination is already registered.', values }),
      });
    }
  }

  if (path.startsWith('/guests/')) {
    const parts = path.split('/').filter(Boolean);
    const id = Number(parts[1]);
    if (!Number.isInteger(id) || id <= 0) {
      return notFoundResponse(env, request, session, session, settings, config);
    }

    if (parts.length === 2 && method === 'GET') {
      const guest = await getGuestById(db, id);
      if (!guest) return notFoundResponse(env, request, session, session, settings, config, 'That guest app does not exist.');
      const [bindings, licenses, events] = await Promise.all([
        listBindingsForGuest(db, id), activeLicenseOptions(db), guestEvents(db, id, 20),
      ]);
      return panelResponse(env, request, session, session, settings, config, {
        title: guest.app_name || guest.package_name,
        active: 'guests',
        content: guestDetailPage({
          guest, bindings, licenses, events, csrf: session.csrf,
        }),
      });
    }

    if (parts.length === 3 && parts[2] === 'action' && method === 'POST') {
      if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
      const sp = await formAll(request);
      if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
      const guest = await getGuestById(db, id);
      if (!guest) return notFoundResponse(env, request, session, session, settings, config, 'That guest app does not exist.');
      const action = String(sp.get('action') || '');
      const done = (message) => flashRedirect(`/guests/${id}`, message);
      const fail = (message) => flashRedirect(`/guests/${id}`, '', message);

      if (action === 'suspend' || action === 'reactivate') {
        const status = action === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
        await updateGuest(db, id, { status }, true);
        await logEvent(db, { guest_app_id: id, event_type: action === 'suspend' ? 'GUEST_SUSPENDED' : 'GUEST_REACTIVATED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Guest status changed by administrator' });
        return done(action === 'suspend' ? 'Guest app suspended.' : 'Guest app reactivated.');
      }
      if (action === 'update') {
        const parsed = readGuestIdentity(sp);
        if (parsed.error) return fail(parsed.error);
        try {
          await updateGuest(db, id, { ...parsed.guest, status: guest.status }, false);
          await logEvent(db, { guest_app_id: id, event_type: 'GUEST_UPDATED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Approved guest identity updated' });
          return done('Approved guest identity updated.');
        } catch {
          return fail('Another guest row already uses that exact identity.');
        }
      }
      if (action === 'binding_add') {
        const licenseId = Number(sp.get('license_id') || 0);
        const license = await getLicenseById(db, licenseId);
        if (!license) return fail('Choose a license.');
        await bindGuest(db, licenseId, id, permissionsFrom(sp));
        await logEvent(db, { license_id: licenseId, guest_app_id: id, event_type: 'BINDING_ADDED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Guest bound to license' });
        return done('Guest bound to license.');
      }
      if (action === 'binding_remove') {
        const licenseId = Number(sp.get('license_id') || 0);
        const binding = await listBindingsForGuest(db, id);
        if (!binding.some((b) => Number(b.license_id) === licenseId)) return fail('Binding not found.');
        await unbindGuest(db, licenseId, id);
        await logEvent(db, { license_id: licenseId, guest_app_id: id, event_type: 'BINDING_REMOVED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Guest unbound from license' });
        return done('Guest binding removed.');
      }
      return fail('Unknown guest action.');
    }
  }

  // -------------------------------------------------------------------------
  // Hosts
  // -------------------------------------------------------------------------
  if (path === '/hosts' && method === 'GET') {
    const q = String(new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120);
    const status = String(new URL(request.url).searchParams.get('status') || 'ALL').toUpperCase();
    const [hosts, counts] = await Promise.all([listHosts(db, { q, status }), hostCounts(db)]);
    return panelResponse(env, request, session, session, settings, config, {
      title: 'Hosts',
      active: 'hosts',
      content: hostsPage({ hosts, counts, q, status, csrf: session.csrf, server: { enabled: settings.server_enabled } }),
    });
  }

  if (path === '/hosts/action' && method === 'POST') {
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    const sp = await formAll(request);
    if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
    const licenseId = Number(sp.get('license_id') || 0);
    const action = String(sp.get('action') || '');
    const license = await getLicenseById(db, licenseId);
    if (!license) return flashRedirect('/hosts', '', 'Host binding not found.');
    const host = await getHostForLicense(db, licenseId);
    if (!host) return flashRedirect('/hosts', '', 'Host binding not found.');

    if (action === 'suspend' || action === 'activate') {
      const status = action === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
      await setHostStatus(db, licenseId, status);
      if (status !== 'ACTIVE') await revokeSessionsForLicense(db, licenseId);
      await logEvent(db, { license_id: licenseId, host_id: host.id, event_type: action === 'suspend' ? 'HOST_SUSPENDED' : 'HOST_REACTIVATED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Host status changed by administrator' });
      return flashRedirect('/hosts', action === 'suspend' ? 'Host binding suspended. Sessions revoked.' : 'Host binding reactivated.');
    }
    if (action === 'reset') {
      await deleteHost(db, licenseId);
      await revokeSessionsForLicense(db, licenseId);
      await logEvent(db, { license_id: licenseId, host_id: host.id, event_type: 'HOST_RESET', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Host binding reset from hosts page' });
      return flashRedirect('/hosts', 'Host binding reset.');
    }
    return flashRedirect('/hosts', '', 'Unknown host action.');
  }

  // -------------------------------------------------------------------------
  // Devices
  // -------------------------------------------------------------------------
  if (path === '/devices' && method === 'GET') {
    const q = String(new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120);
    const status = String(new URL(request.url).searchParams.get('status') || 'ALL').toUpperCase();
    const [devices, counts] = await Promise.all([listDevices(db, { q, status }), deviceCounts(db)]);
    return panelResponse(env, request, session, session, settings, config, {
      title: 'Devices',
      active: 'devices',
      content: devicesPage({ devices, counts, q, status, csrf: session.csrf, server: { enabled: settings.server_enabled } }),
    });
  }

  if (path === '/devices/action' && method === 'POST') {
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    const sp = await formAll(request);
    if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
    const device = await getDeviceById(db, Number(sp.get('device_id') || 0));
    if (!device) return flashRedirect('/devices', '', 'Device not found.');
    const action = String(sp.get('action') || '');
    if (action === 'revoke') {
      await revokeDevice(db, device.id, 'Revoked from devices page', session.username);
      await logEvent(db, { license_id: device.license_id, device_id: device.id, event_type: 'DEVICE_REVOKED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Device revoked by administrator' });
      return flashRedirect('/devices', 'Device revoked.');
    }
    if (action === 'delete') {
      await deleteDevice(db, device.id, session.username);
      await logEvent(db, { license_id: device.license_id, device_id: device.id, event_type: 'DEVICE_DELETED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Device row deleted by administrator' });
      return flashRedirect('/devices', 'Device record deleted.');
    }
    return flashRedirect('/devices', '', 'Unknown device action.');
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------
  if (path === '/sessions' && method === 'GET') {
    const q = String(new URL(request.url).searchParams.get('q') || '').trim().slice(0, 120);
    const status = String(new URL(request.url).searchParams.get('status') || 'ALL').toUpperCase();
    const [sessions, counts] = await Promise.all([listSessions(db, { q, status }), sessionCounts(db)]);
    return panelResponse(env, request, session, session, settings, config, {
      title: 'Sessions',
      active: 'sessions',
      content: sessionsPage({ sessions, counts, q, status, csrf: session.csrf, server: { enabled: settings.server_enabled } }),
    });
  }

  if (path === '/sessions/action' && method === 'POST') {
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    const sp = await formAll(request);
    if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
    const action = String(sp.get('action') || '');
    if (action === 'revoke_all') {
      await revokeAllSessions(db, session.username);
      await logEvent(db, { event_type: 'SESSION_GROUP_REVOKED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'All MAK sessions revoked by administrator' });
      return flashRedirect('/sessions', 'All sessions revoked.');
    }
    if (action === 'revoke') {
      const ok = await revokeSession(db, String(sp.get('session_id') || ''), 'Revoked from sessions page', session.username);
      if (!ok) return flashRedirect('/sessions', '', 'Session not found or already inactive.');
      await logEvent(db, { event_type: 'SESSION_REVOKED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Session revoked by administrator' });
      return flashRedirect('/sessions', 'Session revoked.');
    }
    return flashRedirect('/sessions', '', 'Unknown session action.');
  }

  // -------------------------------------------------------------------------
  // Security logs
  // -------------------------------------------------------------------------
  if (path === '/logs' && method === 'GET') {
    const params = new URL(request.url).searchParams;
    const q = String(params.get('q') || '').trim().slice(0, 120);
    const result = String(params.get('result') || 'ALL').toUpperCase();
    const type = String(params.get('type') || '').trim().slice(0, 64);
    const [events, resultCounts, types] = await Promise.all([
      listEvents(db, { q, result: result === 'ALL' ? '' : result, type, limit: 150 }),
      (eventCounts(db)),
      eventTypes(db),
    ]);
    return panelResponse(env, request, session, session, settings, config, {
      title: 'Security logs',
      active: 'logs',
      content: logsPage({ events, resultCounts, q, result, type, types, csrf: session.csrf }),
    });
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------
  if (path === '/settings' && method === 'GET') {
    const [stats, eCounts, admins] = await Promise.all([
      dashboardStats(db), eventCounts(db), adminCount(db),
    ]);
    return panelResponse(env, request, session, session, settings, config, {
      title: 'Settings',
      active: 'settings',
      content: settingsPage({
        admin: session, csrf: session.csrf,
        server: { enabled: settings.server_enabled },
        signing: signingView(config),
        settings,
        stats: { ...stats, events: eCounts.total, admins },
        panelName: panelName(env),
      }),
    });
  }

  if (path === '/settings/server' && method === 'POST') {
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    const sp = await formAll(request);
    if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
    const action = String(sp.get('action') || 'save');
    let enabled;
    if (action === 'toggle') {
      enabled = !settings.server_enabled;
    } else {
      enabled = sp.get('server_enabled') === '1';
    }
    if (enabled && !config.ok) {
      return flashRedirect(action === 'toggle' ? '/dashboard' : '/settings', '', 'Signing key is not configured. Activation cannot be enabled.');
    }
    const maintenance = String(sp.get('maintenance_message') || settings.maintenance_message).trim().slice(0, 300)
      || 'Activation server is temporarily offline for maintenance.';
    const announcement = String(sp.get('announcement') || settings.announcement).trim().slice(0, 500);
    await setSettings(db, {
      server_enabled: enabled ? '1' : '0',
      ...(action === 'toggle' ? {} : { maintenance_message: maintenance, announcement }),
    });
    await logEvent(db, { event_type: enabled ? 'SERVER_ENABLED' : 'SERVER_DISABLED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: enabled ? 'Activation server switched ON' : 'Activation server switched OFF' });
    return flashRedirect(action === 'toggle' ? '/dashboard' : '/settings', enabled ? 'Activation server is ON.' : 'Activation server is OFF. All MAK decisions fail closed.');
  }

  if (path === '/settings/protocol' && method === 'POST') {
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    const sp = await formAll(request);
    if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
    const sessionTtl = clampInt(sp.get('session_ttl'), 60, 86400, 0);
    const heartbeat = clampInt(sp.get('heartbeat_interval'), 30, 3600, 0);
    const challengeTtl = clampInt(sp.get('challenge_ttl'), 15, 300, 0);
    const clockSkew = clampInt(sp.get('clock_skew'), 30, 900, 0);
    const authTtl = clampInt(sp.get('authorization_ttl'), 30, 600, 0);
    const version = String(sp.get('server_version') || '').trim();
    if (!sessionTtl || !heartbeat || !challengeTtl || !clockSkew || !authTtl) {
      return flashRedirect('/settings', '', 'A timing value is outside its allowed range.');
    }
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(version)) {
      return flashRedirect('/settings', '', 'Server version label is malformed.');
    }
    await setSettings(db, {
      session_ttl: String(sessionTtl),
      heartbeat_interval: String(heartbeat),
      challenge_ttl: String(challengeTtl),
      clock_skew: String(clockSkew),
      authorization_ttl: String(authTtl),
      guest_proof_required: sp.get('guest_proof_required') === '1' ? '1' : '0',
      server_version: version,
    });
    await logEvent(db, { event_type: 'SETTINGS_UPDATED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Protocol timings updated' });
    return flashRedirect('/settings', 'Protocol settings saved.');
  }

  if (path === '/settings/password' && method === 'POST') {
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    const sp = await formAll(request);
    if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
    const current = String(sp.get('current_password') || '');
    const next = String(sp.get('new_password') || '');
    const confirm = String(sp.get('confirm_password') || '');
    if (next.length < 10 || next.length > 200) return flashRedirect('/settings', '', 'New password must be between 10 and 200 characters.');
    if (next !== confirm) return flashRedirect('/settings', '', 'New passwords do not match.');
    const row = await findAdminByUsername(db, session.username);
    if (!row || !(await verifyPassword(current, row.password_hash))) {
      return flashRedirect('/settings', '', 'Current password is incorrect.');
    }
    await setAdminPassword(db, session.id, next);
    await destroyOtherAdminSessions(db, session.id, request);
    await logEvent(db, { event_type: 'ADMIN_PASSWORD_CHANGED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Administrator password updated; other sessions revoked' });
    return flashRedirect('/settings', 'Password updated. Other admin sessions were signed out.');
  }

  if (path === '/settings/danger' && method === 'POST') {
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    const sp = await formAll(request);
    if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
    const action = String(sp.get('action') || '');
    if (action === 'revoke_sessions') {
      await revokeAllSessions(db, session.username);
      await logEvent(db, { event_type: 'SESSION_GROUP_REVOKED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'All sessions revoked from settings' });
      return flashRedirect('/settings', 'All MAK sessions revoked.');
    }
    if (action === 'clear_challenges') {
      const cutoff = nowS();
      await db.prepare('DELETE FROM mak_challenges WHERE expires_at < ? OR consumed_at IS NOT NULL').bind(cutoff).run();
      await logEvent(db, { event_type: 'CHALLENGES_CLEANED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Expired/consumed challenge rows removed' });
      return flashRedirect('/settings', 'Challenge table cleaned.');
    }
    return flashRedirect('/settings', '', 'Unknown settings action.');
  }

  return notFoundResponse(env, request, session, session, settings, config);
}

