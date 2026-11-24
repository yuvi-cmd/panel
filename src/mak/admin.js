// MAK administration, mounted under /sdk inside the existing SDK Panel. The
// existing panel session (sdk_session -> users) is the only login: this module
// adds MAK pages to that session rather than replacing the panel's auth.

import { getAdminSession, verifyCsrf } from './auth.js';
import {
  canonicalMak, clampInt, generateMak, hashIp, nowS,
  makHash, normalizeHex64, signingPublicKeys, validPackageName,
} from './crypto.js';
import { loadKeyConfig } from './keystore.js';
import { getSettings, setSettings } from './settings.js';
import {
  eventTypes, licenseEvents, listEvents, logEvent, recentEvents,
} from './events.js';
import {
  clientIp, flashRedirect, formAll, html, sameOrigin, text,
} from './http.js';
import {
  activeLicenseOptions, bindGuestAtomic, createGuest, dashboardStats,
  deleteBinding, deleteDevice, deleteGuestApp, deleteHostCascade, deleteLicense, deviceCounts, eventCounts, expiringLicenses,
  getDeviceById, getGuestById, getHostById, getHostForLicense, getHostsForLicense, getLicenseById, getSession,
  guestCounts, guestEvents, hostCounts, licenseCounts, listAllActiveGuests,
  listBindingsForGuest, listBindingsForLicense, listDevices, listGuests, listHosts,
  listLicenses, listSessions, revokeAllSessions, revokeDevice, revokeLicense,
  revokeSession, revokeSessionsForLicense, resetLicenseDevices,
  rotateLicenseCredential, sessionCounts, setHostStatus,
  setLicenseStatus, updateGuest, updateLicensePolicy, updateLicenseQuota, upsertHost,
} from './store.js';
import { dashboardPage } from './pages/dashboard.js';
import { devicesPage } from './pages/devices.js';
import { guestsPage, guestDetailPage, newGuestPage } from './pages/guests.js';
import {
  licenseDetailPage, licensesPage, newLicensePage, revealLicensePage,
} from './pages/licenses.js';
import { logsPage } from './pages/logs.js';
import { hostsPage } from './pages/hosts.js';
import { sessionsPage } from './pages/sessions.js';
import { settingsPage } from './pages/settings.js';
import { emptyState, flashHtml, icon, pageHeader } from './ui.js';
import { layout as sdkLayout } from '../frontend/ui.js';
import { MAK_ADMIN_CSS, MAK_ADMIN_JS, makAdminContent } from '../frontend/sdk/admin-ui.js';
import { hashPassword as hashPanelPassword, verifyPassword as verifyPanelPassword } from '../backend/crypto.js';
import { issueMak, parseLicensePolicy } from './issue.js';

const PANEL_DEFAULT = 'MAK Activation';
const FLASH_MAX = 380;

function clipFlash(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, FLASH_MAX);
}

function panelName(env) { return String(env.PANEL_NAME || PANEL_DEFAULT); }

function redirectWith(location, headers = {}, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: location, 'Cache-Control': 'no-store', ...headers },
  });
}

// Internal MAK pages are rendered with absolute links (/licenses, /settings,
// ...). They can be mounted at /mak (legacy) or /sdk (the only supported UI
// now). These helpers translate those internal links to the public SDK paths.
const MAK_ROOTS = ['/dashboard', '/licenses', '/guests', '/hosts', '/devices', '/sessions', '/logs', '/settings'];

function adminMount(request) {
  const p = new URL(request.url).pathname;
  return p === '/sdk' || p.startsWith('/sdk/') ? '/sdk' : '/mak';
}

function publicAdminPath(mount, internal) {
  const p = String(internal || '/dashboard');
  if (mount === '/mak') return '/mak' + (p === '/' ? '' : p);
  if (p === '/' || p === '/dashboard') return '/sdk';
  if (p === '/licenses/new') return '/sdk/generate';
  if (p === '/licenses') return '/sdk/keys';
  if (p.startsWith('/licenses/')) return '/sdk/keys' + p.slice('/licenses'.length);
  return '/sdk' + p;
}

function mountMakLinks(out, mount = '/mak') {
  let value = String(out);
  if (mount === '/mak') {
    for (const p of MAK_ROOTS) {
      value = value.replaceAll(`href="${p}`, `href="/mak${p}`)
        .replaceAll(`action="${p}`, `action="/mak${p}`);
    }
    return value;
  }
  // SDK mounting has one renamed route: licenses -> keys.
  value = value.replaceAll('href="/licenses/new', 'href="/sdk/generate')
    .replaceAll('action="/licenses/new', 'action="/sdk/generate');
  for (const p of MAK_ROOTS) {
    const target = p === '/dashboard' ? '/sdk'
      : p === '/licenses' ? '/sdk/keys'
        : `/sdk${p}`;
    value = value.replaceAll(`href="${p}`, `href="${target}`)
      .replaceAll(`action="${p}`, `action="${target}`);
  }
  return value;
}

// Block/suspend/delete actions must land back on the same filtered URL. The
// form carries an internal return path; Referer is only a fallback because the
// query string (q/status) is otherwise lost.
function samePagePath(sp, request, mount, fallback = '/hosts') {
  let raw = String(sp.get('return') || '').trim();
  if (!raw) {
    const ref = String(request.headers.get('Referer') || '');
    try {
      const target = new URL(ref);
      const here = new URL(request.url);
      if (target.origin === here.origin) raw = target.pathname + target.search;
    } catch {}
  }
  if (!raw.startsWith('/') || raw.startsWith('//')) raw = fallback;
  const [pathPart, ...queryRest] = raw.split('?');
  const query = queryRest.join('?');
  const path = pathPart.startsWith(mount + '/') || pathPart.startsWith('/sdk/')
    ? pathPart
    : publicAdminPath(mount, pathPart || fallback);
  return path + (query ? '?' + query : '');
}

function panelResponse(env, request, admin, session, settings, config, opts = {}) {
  const url = new URL(request.url);
  const mount = adminMount(request);
  const active = String(opts.active || '');
  const route = active === 'dashboard' ? 'sdk'
    : active === 'licenses' ? 'sdk/keys'
      : active ? 'sdk/' + active : 'sdk';
  const content = mountMakLinks(`${flashHtml(opts.ok ?? clipFlash(url.searchParams.get('ok')), opts.err ?? clipFlash(url.searchParams.get('err')))}
    ${opts.content || ''}`, mount);
  return html(sdkLayout({
    title: opts.title || 'Panel',
    route,
    username: admin?.username || session?.username || 'admin',
    panelCode: env.PANEL_CODE || 'SDK',
    panelName: panelName(env),
    content: makAdminContent(content),
    theme: 'emerald',
    extraCss: MAK_ADMIN_CSS,
    extraScript: MAK_ADMIN_JS,
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

export async function handleMakAdmin(request, env, db, options = {}) {
  const fullPath = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  const mount = options.mount || adminMount(request);
  const session = await getAdminSession(db, request);
  if (!session) {
    return redirectWith('/login?next=' + encodeURIComponent(fullPath + (new URL(request.url).search || '')));
  }

  // /mak and /mak/ both land on the MAK overview. When the SDK router forwards
  // /sdk/keys/:id etc. it supplies the internal path explicitly.
  const path = options.internalPath || (fullPath === mount ? '/dashboard'
    : fullPath.startsWith(mount + '/') ? (fullPath.slice(mount.length) || '/dashboard')
      : '/dashboard');
  const flash = (suffix, ok = '', err = '') => flashRedirect(publicAdminPath(mount, suffix), ok, err);
  const method = request.method.toUpperCase();
  const keys = await loadKeyConfig(db, env);
  const config = keys.signing;
  const settings = await getSettings(db);
  const ip = clientIp(request);
  const ipHash = await hashIp(ip, env);

  if (path === '/favicon.ico') return new Response(null, { status: 204 });
  // Use the panel's own sign-out so the sdk_session cookie is cleared.
  if (path === '/logout') return redirectWith('/logout');

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
      custom_key: String(sp.get('custom_key') || ''),
      label: String(sp.get('label') || ''),
      user_ref: String(sp.get('user_ref') || ''),
      duration: String(sp.get('duration') || '30'),
      expires_on: String(sp.get('expires_on') || ''),
      max_devices: String(sp.get('max_devices') || '1'),
      max_activations: String(sp.get('max_activations') || '1'),
      session_ttl: String(sp.get('session_ttl') || '3600'),
      max_packages: String(sp.get('max_packages') || '1'),
      max_apps: String(sp.get('max_apps') || '2'),
      max_installs: String(sp.get('max_installs') || '3'),
      signature_bind: String(sp.get('signature_bind') ?? '1'),
      host_package: String(sp.get('host_package') || ''),
      host_app_name: String(sp.get('host_app_name') || ''),
      host_cert: String(sp.get('host_cert') || ''),
      host_bind_mode: String(sp.get('host_bind_mode') || 'AUTO'),
      notes: String(sp.get('notes') || ''),
      guest_ids: sp.getAll('guest_ids'),
    };
    const parsed = parseLicensePolicy(sp);
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
    let issued;
    try {
      issued = await issueMak(db, sp, session.id);
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
    if (issued.error) {
      return panelResponse(env, request, session, session, settings, config, {
        title: 'Issue MAK',
        active: 'licenses',
        status: 400,
        content: newLicensePage({
          csrf: session.csrf, guests, error: issued.error, values,
          defaultExpiry: defaultExpiryDate(),
          server: { enabled: settings.server_enabled, signingReady: config.ok },
        }),
      });
    }
    const { credential, licenseId } = issued;
    const license = await getLicenseById(db, licenseId);
    await logEvent(db, {
      license_id: licenseId, event_type: 'LICENSE_ISSUED', result: 'SUCCESS',
      actor: session.username, ip_hash: ipHash,
      detail: 'MAK issued for ' + (license?.license_uid || 'license'),
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
      const [host, hosts, bindings, allGuests, events] = await Promise.all([
        getHostForLicense(db, id), getHostsForLicense(db, id), listBindingsForLicense(db, id), listAllActiveGuests(db),
        licenseEvents(db, id, 12),
      ]);
      return panelResponse(env, request, session, session, settings, config, {
        title: license.label || 'License',
        active: 'licenses',
        content: licenseDetailPage({
          license, host, hosts, bindings, allGuests, events,
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
      const back = samePagePath(sp, request, mount, `/licenses/${id}`);
      const done = (message) => flashRedirect(back, message);
      const fail = (message) => flashRedirect(back, '', message);

      if (action === 'update_policy') {
        const hosts = await getHostsForLicense(db, id);
        const parsed = parseLicensePolicy(sp, { hasHost: hosts.length > 0 });
        if (parsed.error) return fail(parsed.error);
        // Suspended/blocked packages still occupy slots; only explicit delete
        // releases a package limit slot.
        const boundHosts = hosts.length;
        if (Number(parsed.policy.max_packages) < boundHosts) {
          return fail('Max host packages cannot be lower than the ' + boundHosts + ' package(s) already bound.');
        }
        if (Number(parsed.policy.duration_days) > 0 && license.started_at) {
          parsed.policy.expires_at = Number(license.started_at) + Number(parsed.policy.duration_days) * 86400;
        }
        await updateLicensePolicy(db, id, parsed.policy);
        await logEvent(db, { license_id: id, event_type: 'LICENSE_UPDATED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'License policy updated' });
        return done('License policy saved.');
      }
      if (action === 'extend_duration') {
        const raw = String(sp.get('extend_days') || '30');
        if (raw === 'lifetime') {
          await updateLicenseQuota(db, id, { expires_at: null, duration_days: null, started_at: null });
        } else if (Number(license.duration_days) > 0 && !license.started_at) {
          // Not started yet: extend the reserved duration without starting it.
          const days = Math.max(1, Math.min(3650, Number(raw) || 30));
          await updateLicenseQuota(db, id, { duration_days: Number(license.duration_days) + days });
        } else {
          const days = Math.max(1, Math.min(3650, Number(raw) || 30));
          const base = Math.max(nowS(), Number(license.expires_at) || 0);
          await updateLicenseQuota(db, id, { expires_at: base + days * 86400 });
        }
        await logEvent(db, {
          license_id: id, event_type: 'LICENSE_EXTENDED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash,
          detail: raw === 'lifetime' ? 'Expiry set to lifetime' : 'Expiry extended by ' + raw + ' day(s)',
        });
        return done(raw === 'lifetime' ? 'Expiry set to lifetime.' : 'Expiry extended by ' + raw + ' day(s).');
      }
      if (action === 'extend_limits') {
        const hosts = await getHostsForLicense(db, id);
        const maxPackages = clampInt(sp.get('max_packages'), 1, 100, Number(license.max_packages || 1));
        const maxApps = clampInt(sp.get('max_apps'), 1, 100, Number(license.max_apps || 2));
        const maxInstalls = clampInt(sp.get('max_installs'), 1, 100, Number(license.max_installs || 3));
        if (!maxPackages || !maxApps || !maxInstalls) return fail('Limits must be between 1 and 100.');
        if (maxPackages < hosts.length) return fail('Package limit cannot be lower than the ' + hosts.length + ' package(s) already saved.');
        await updateLicenseQuota(db, id, { max_packages: maxPackages, max_apps: maxApps, max_installs: maxInstalls });
        await logEvent(db, {
          license_id: id, event_type: 'LIMITS_EXTENDED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash,
          detail: 'Limits set to packages=' + maxPackages + ' apps=' + maxApps + ' installs=' + maxInstalls,
        });
        return done('Limits updated.');
      }
      if (action === 'host_block' || action === 'host_unblock') {
        const host = await getHostById(db, Number(sp.get('host_id') || 0));
        if (!host || Number(host.license_id) !== id) return fail('Host package not found for this license.');
        const blocking = action === 'host_block';
        await setHostStatus(db, id, blocking ? 'SUSPENDED' : 'ACTIVE', host.id);
        await revokeSessionsForLicense(db, id);
        await logEvent(db, {
          license_id: id, event_type: blocking ? 'HOST_BLOCKED' : 'HOST_UNBLOCKED', result: 'SUCCESS',
          actor: session.username, ip_hash: ipHash,
          detail: (blocking ? 'Host package blocked: ' : 'Host package unblocked: ') + host.package_name,
        });
        return done(blocking ? 'Host package blocked.' : 'Host package unblocked.');
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
      if (action === 'delete' || action === 'license_delete') {
        const deleted = await deleteLicense(db, id);
        if (!deleted) return notFoundResponse(env, request, session, session, settings, config, 'That license does not exist.');
        // The license row is gone, so log the deletion without a license_id.
        // Events tied to the old license are intentionally kept as audit trail.
        await logEvent(db, {
          event_type: 'LICENSE_DELETED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash,
          detail: 'MAK deleted permanently: ' + deleted.license_uid + (deleted.label ? ' (' + deleted.label + ')' : ''),
        });
        return flash('/licenses', 'MAK deleted permanently. Its hosts, bindings, grants and legacy device/session rows were removed.');
      }
      if (action === 'rotate') {
        const credential = generateMak();
        const canonical = canonicalMak(credential);
        await rotateLicenseCredential(db, id, await makHash(canonical), canonical);
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
        const hostAppName = String(sp.get('host_app_name') || '').trim().slice(0, 120);
        const hostCertRaw = String(sp.get('host_cert') || '').trim();
        const hostCert = normalizeHex64(hostCertRaw);
        if (!validPackageName(hostPackage)) return fail('Host package name is malformed.');
        if (hostCertRaw && !hostCert) return fail('Host certificate must be 64 hex characters.');
        if (!hostCert && Number(license.signature_bind ?? 1) === 1) return fail('Signature Bind is ON: host certificate is required.');
        const hosts = await getHostsForLicense(db, id);
        const existing = hosts.find((h) => String(h.package_name) === hostPackage);
        if (!existing && hosts.length >= Number(license.max_packages || 1)) {
          return fail('Host package limit reached. Increase Package limit before adding another.');
        }
        await upsertHost(db, id, { package_name: hostPackage, app_name: hostAppName, cert_sha256: hostCert });
        await revokeSessionsForLicense(db, id);
        await logEvent(db, { license_id: id, event_type: 'HOST_BOUND', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Host package saved by administrator: ' + hostPackage });
        return done('Host package saved. Sessions revoked.');
      }
      if (action === 'host_reset' || action === 'host_delete') {
        const hostId = Number(sp.get('host_id') || 0);
        const deleted = await deleteHostCascade(db, id, hostId);
        if (hostId && !deleted) return fail('Host package not found for this license.');
        await revokeSessionsForLicense(db, id);
        await logEvent(db, { license_id: id, host_id: hostId || null, event_type: 'HOST_DELETED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: deleted ? 'Host package deleted with bindings and grants: ' + deleted.package_name : 'All host packages deleted with their bindings and grants' });
        return done(hostId ? 'Host package deleted. Its slot is free again.' : 'All host packages deleted.');
      }
      if (action === 'binding_add') {
        const guestId = Number(sp.get('guest_id') || 0);
        const guest = await getGuestById(db, guestId);
        if (!guest) return fail('Choose an approved guest app.');
        const bound = await bindGuestAtomic(db, id, 0, guestId, guest.package_name, permissionsFrom(sp), license.max_apps);
        if (!bound.ok) return fail('App limit reached for this license. Delete an app binding to free a slot.');
        await logEvent(db, { license_id: id, guest_app_id: guestId, event_type: 'BINDING_ADDED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Guest bound to license' });
        return done('Guest app bound.');
      }
      if (action === 'binding_remove') {
        const guestId = Number(sp.get('guest_id') || 0);
        await deleteBinding(db, id, guestId);
        await logEvent(db, { license_id: id, guest_app_id: guestId, event_type: 'BINDING_REMOVED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Guest binding deleted from license' });
        return done('Guest app removed. Its app slot is free again.');
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
        return done('All active grants and legacy device sessions were reset.');
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
      return flash(`/guests/${id}`, 'Guest app registered.');
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
      const done = (message) => flash(`/guests/${id}`, message);
      const fail = (message) => flash(`/guests/${id}`, '', message);

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
        const bound = await bindGuestAtomic(db, licenseId, 0, id, guest.package_name, permissionsFrom(sp), license.max_apps);
        if (!bound.ok) return fail('App limit reached for this license. Delete an app binding to free a slot.');
        await logEvent(db, { license_id: licenseId, guest_app_id: id, event_type: 'BINDING_ADDED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Guest bound to license' });
        return done('Guest bound to license.');
      }
      if (action === 'binding_remove') {
        const licenseId = Number(sp.get('license_id') || 0);
        const binding = await listBindingsForGuest(db, id);
        if (!binding.some((b) => Number(b.license_id) === licenseId)) return fail('Binding not found.');
        await deleteBinding(db, licenseId, id);
        await logEvent(db, { license_id: licenseId, guest_app_id: id, event_type: 'BINDING_REMOVED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Guest binding deleted from license' });
        return done('Guest binding removed. Its app slot is free again.');
      }
      if (action === 'delete') {
        const deleted = await deleteGuestApp(db, id);
        if (!deleted) return notFoundResponse(env, request, session, session, settings, config, 'That guest app does not exist.');
        await logEvent(db, {
          guest_app_id: id, event_type: 'GUEST_DELETED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash,
          detail: 'Guest app deleted permanently: ' + deleted.package_name + ' v' + deleted.version_code,
        });
        return flash('/guests', 'Guest app deleted. Its license bindings and app slots were removed.');
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
    const back = samePagePath(sp, request, mount, '/hosts');
    const licenseId = Number(sp.get('license_id') || 0);
    const action = String(sp.get('action') || '');
    const license = await getLicenseById(db, licenseId);
    if (!license) return flashRedirect(back, '', 'Host binding not found.');
    const hostId = Number(sp.get('host_id') || 0);
    const host = hostId ? await getHostById(db, hostId) : await getHostForLicense(db, licenseId);
    if (!host || Number(host.license_id) !== licenseId) return flashRedirect(back, '', 'Host binding not found.');

    if (action === 'suspend' || action === 'activate') {
      const status = action === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
      await setHostStatus(db, licenseId, status, host.id);
      if (status !== 'ACTIVE') await revokeSessionsForLicense(db, licenseId);
      await logEvent(db, { license_id: licenseId, host_id: host.id, event_type: action === 'suspend' ? 'HOST_SUSPENDED' : 'HOST_REACTIVATED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Host package ' + host.package_name + ' status changed by administrator' });
      return flashRedirect(back, action === 'suspend' ? 'Host package suspended. Its package slot stays reserved.' : 'Host package reactivated.');
    }
    if (action === 'delete' || action === 'reset') {
      const deleted = await deleteHostCascade(db, licenseId, host.id);
      if (!deleted) return flashRedirect(back, '', 'Host package not found for this license.');
      await revokeSessionsForLicense(db, licenseId);
      await logEvent(db, { license_id: licenseId, event_type: 'HOST_DELETED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Host package deleted with bindings and grants: ' + host.package_name });
      return flashRedirect(back, 'Host package deleted. Its slot is free again.');
    }
    return flashRedirect(back, '', 'Unknown host action.');
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
    if (!device) return flash('/devices', '', 'Device not found.');
    const action = String(sp.get('action') || '');
    if (action === 'revoke') {
      await revokeDevice(db, device.id, 'Revoked from devices page', session.username);
      await logEvent(db, { license_id: device.license_id, device_id: device.id, event_type: 'DEVICE_REVOKED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Device revoked by administrator' });
      return flash('/devices', 'Device revoked.');
    }
    if (action === 'delete') {
      await deleteDevice(db, device.id, session.username);
      await logEvent(db, { license_id: device.license_id, device_id: device.id, event_type: 'DEVICE_DELETED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Device row deleted by administrator' });
      return flash('/devices', 'Device record deleted.');
    }
    return flash('/devices', '', 'Unknown device action.');
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
      return flash('/sessions', 'All sessions revoked.');
    }
    if (action === 'revoke') {
      const ok = await revokeSession(db, String(sp.get('session_id') || ''), 'Revoked from sessions page', session.username);
      if (!ok) return flash('/sessions', '', 'Session not found or already inactive.');
      await logEvent(db, { event_type: 'SESSION_REVOKED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Session revoked by administrator' });
      return flash('/sessions', 'Session revoked.');
    }
    return flash('/sessions', '', 'Unknown session action.');
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
      dashboardStats(db), eventCounts(db), 1,
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
      return flash(action === 'toggle' ? '/dashboard' : '/settings', '', 'Signing key is not configured. Activation cannot be enabled.');
    }
    const maintenance = String(sp.get('maintenance_message') || settings.maintenance_message).trim().slice(0, 300)
      || 'Activation server is temporarily offline for maintenance.';
    const announcement = String(sp.get('announcement') || settings.announcement).trim().slice(0, 500);
    await setSettings(db, {
      server_enabled: enabled ? '1' : '0',
      ...(action === 'toggle' ? {} : { maintenance_message: maintenance, announcement }),
    });
    await logEvent(db, { event_type: enabled ? 'SERVER_ENABLED' : 'SERVER_DISABLED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: enabled ? 'Activation server switched ON' : 'Activation server switched OFF' });
    return flash(action === 'toggle' ? '/dashboard' : '/settings', enabled ? 'Activation server is ON.' : 'Activation server is OFF. All MAK decisions fail closed.');
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
      return flash('/settings', '', 'A timing value is outside its allowed range.');
    }
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(version)) {
      return flash('/settings', '', 'Server version label is malformed.');
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
    return flash('/settings', 'Protocol settings saved.');
  }

  if (path === '/settings/password' && method === 'POST') {
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    const sp = await formAll(request);
    if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
    const current = String(sp.get('current_password') || '');
    const next = String(sp.get('new_password') || '');
    const confirm = String(sp.get('confirm_password') || '');
    if (next.length < 10 || next.length > 200) return flash('/settings', '', 'New password must be between 10 and 200 characters.');
    if (next !== confirm) return flash('/settings', '', 'New passwords do not match.');
    const row = await db.prepare('SELECT * FROM users WHERE id=?').bind(session.id).first().catch(() => null);
    if (!row || !(await verifyPanelPassword(current, row.password_hash))) {
      return flash('/settings', '', 'Current password is incorrect.');
    }
    await db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPanelPassword(next), session.id).run();
    await logEvent(db, { event_type: 'ADMIN_PASSWORD_CHANGED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Panel password updated from MAK settings' });
    return flash('/settings', 'Password updated.');
  }

  if (path === '/settings/danger' && method === 'POST') {
    if (!sameOrigin(request)) return text('Cross-site request blocked.', 403);
    const sp = await formAll(request);
    if (!verifyCsrf(session, sp.get('_csrf'))) return text('CSRF token rejected.', 403);
    const action = String(sp.get('action') || '');
    if (action === 'revoke_sessions') {
      await revokeAllSessions(db, session.username);
      await logEvent(db, { event_type: 'SESSION_GROUP_REVOKED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'All sessions revoked from settings' });
      return flash('/settings', 'All MAK sessions revoked.');
    }
    if (action === 'clear_challenges') {
      const cutoff = nowS();
      await db.prepare('DELETE FROM mak_challenges WHERE expires_at < ? OR consumed_at IS NOT NULL').bind(cutoff).run();
      await logEvent(db, { event_type: 'CHALLENGES_CLEANED', result: 'SUCCESS', actor: session.username, ip_hash: ipHash, detail: 'Expired/consumed challenge rows removed' });
      return flash('/settings', 'Challenge table cleaned.');
    }
    return flash('/settings', '', 'Unknown settings action.');
  }

  return notFoundResponse(env, request, session, session, settings, config);
}

