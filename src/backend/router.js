// Backend router — every HTTP route of the Worker.
// Backend modules ./ (crypto, api, security, db, connect, mundo, bcore…),
// frontend page renderers ../frontend/*.

// ---- backend ----
import { mundoSaltFromEnv, mundoAesKeyHex, hashPassword, verifyPassword, randomHexKey } from './crypto.js';
import { handleApi } from './api.js';
import { clientIp, hitRate, isProfessor } from './security.js';
import { handleConnect, handleEncrypt, ensureModVersions, libUrlOk } from './connect.js';
import { handleNexon } from './nexon.js';
import { handleApkKill } from './apk-kill.js';
import { handleUnlockProxy } from './unlock-proxy.js';
import { handleMundo } from './mundo.js';
import { handleBcore } from './bcore.js';
import { ensureDB } from './db.js';
import { html, redir, parseCookies, formParams, tsMs, deny } from './http.js';
import { getSession, sessCookie, clearCookie } from './session.js';
import { THEMES, HEX6, getTheme, getAccent, panelName } from './theme.js';
import { deviceFingerprint } from './device.js';
import { handleOpenCodeApi, getOpenCodeAdminData, applyOpenCodeAdminAction, opencodeKeyStatus } from './opencode.js';
import {
  adminCookie,
  adminLoginRate,
  adminPasswordConfigured,
  adminPasswordSource,
  clearAdminCookie,
  createOpenCodeAdminSession,
  destroyOpenCodeAdminSession,
  getOpenCodeAdminSession,
  verifyAdminPassword,
} from './opencode-admin.js';

// ---- frontend ----
import { layout, authPage } from '../frontend/ui.js';
import { panelLayout } from '../frontend/panel-ui.js';
import { loginPage, registerPage, resetPage, joinPage } from '../frontend/auth.js';
import { dashboardPage, generatePage } from '../frontend/sdk/dash.js';
import { keysPage } from '../frontend/sdk/keys.js';
import { serverPage as sdkServerPage, hashPage as sdkHashPage } from '../frontend/sdk/server.js';
import { panelDashboard, panelGenerate, panelKeyList, KEY_PRICING, KEY_DURATIONS, arcxRand } from '../frontend/panel/dash.js';
import { usersPage, adminsPage, permissionsPage, referralPage } from '../frontend/panel/users.js';
import { serverPage, settingsPage, aesPage, apiTestPage, createPanelPage, loaderPage, MOD_FIELDS } from '../frontend/panel/system.js';
import { opencodeLoginPage, opencodeAdminLayout, opencodeOverview, opencodeUsersPage, opencodeNoticesPage, opencodeSettingsPage } from '../frontend/opencode-admin.js';


export default {
  async fetch(request, env, ctx) {
    const db = env.DB;
    const mainPanel = env.PANEL_CODE || 'YUVI_001';
    const envName = env.PANEL_NAME || 'YUVI PANEL';
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();
    await ensureDB(db, mainPanel);

    if (method === 'OPTIONS' && (path.startsWith('/sdk/') || path.startsWith('/connect/') || path.startsWith('/encrypt/') || path.startsWith('/nexon/') || path.startsWith('/api/')))
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    if (path.startsWith('/connect/')) return handleConnect(request, db, decodeURIComponent(path.split('/')[2] || ''), env);
    if (path === '/connect') return handleConnect(request, db, url.searchParams.get('panel_code') || mainPanel, env);
    if (path.startsWith('/nexon/')) return handleNexon(request, db, decodeURIComponent(path.split('/')[2] || ''), env, ctx);
    if (path === '/nexon') return handleNexon(request, db, url.searchParams.get('panel_code') || mainPanel, env, ctx);
    // TEMPORARY diagnostics for the CA-bundle login failure. Remove after the
    // device login is confirmed; token-protected, no secrets are exposed.
    if (path === '/nexon-diag') {
      const DIAG_TOKEN = '71bcbb0871010ef6e5ce81b95ee0ea45';
      const J = (o, c = 200) => new Response(JSON.stringify(o), { status: c, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      if (url.searchParams.get('token') !== DIAG_TOKEN) return J({ ok: false, error: 'FORBIDDEN' }, 403);
      const action = url.searchParams.get('action') || 'state';
      try {
        if (action === 'state') {
          const keys = await db.prepare('SELECT id,key_value,panel_code,is_active,is_blocked,expires_at,device_limit,uses FROM api_keys ORDER BY id ASC LIMIT 100').all();
          const devices = await db.prepare('SELECT key_id,device_uuid,last_seen FROM key_devices ORDER BY last_seen DESC LIMIT 100').all();
          return J({ ok: true, keys: keys.results, devices: devices.results });
        }
        if (action === 'reset') {
          const key = String(url.searchParams.get('key') || 'YUVI_001');
          const row = await db.prepare('SELECT id,key_value,panel_code FROM api_keys WHERE key_value=? LIMIT 1').bind(key).first();
          if (!row) return J({ ok: false, error: 'KEY NOT FOUND', key }, 404);
          await db.prepare('DELETE FROM key_devices WHERE key_id=?').bind(row.id).run();
          await db.prepare("UPDATE api_keys SET is_active=1,is_blocked=0,device_limit=1,expires_at=datetime('now','+30 days') WHERE id=?").bind(row.id).run();
          return J({ ok: true, key: row.key_value, panel: row.panel_code, id: row.id });
        }
        if (action === 'hits') {
          const hits = await db.prepare('SELECT id,panel_code,key_value,device_uuid,q,user_agent,created_at FROM nexon_hits ORDER BY id DESC LIMIT 50').all();
          return J({ ok: true, hits: hits.results });
        }
        if (action === 'clearhits') {
          await db.prepare('DELETE FROM nexon_hits').run();
          return J({ ok: true });
        }
        return J({ ok: false, error: 'UNKNOWN ACTION' }, 400);
      } catch (e) {
        return J({ ok: false, error: String((e && e.message) || e) }, 500);
      }
    }
    if (path === '/server/apk_kill.php') return handleApkKill(request, db, env, ctx);
    if (path === '/secure/unlock') return handleUnlockProxy(request, db, env, ctx);
    if (path === '/health') {
      return new Response(JSON.stringify({ ok: true, build: '2026-11-11-unlockproxy', panel: mainPanel }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
    }
    if (path.startsWith('/encrypt/')) return handleEncrypt(request, db, decodeURIComponent(path.split('/')[2] || ''), env);
    if (path.startsWith('/sdk/mundo/') || path === '/sdk/mundo') return handleMundo(request, db, decodeURIComponent(path.split('/')[3] || url.searchParams.get('panel_code') || mainPanel), env);
    if (path.startsWith('/sdk/bcore/') || path === '/sdk/bcore') return handleBcore(request, db, decodeURIComponent(path.split('/')[3] || url.searchParams.get('panel_code') || mainPanel), env);
    if (path.startsWith('/api/opencode/')) return handleOpenCodeApi(request, db, env);
    if (path.startsWith('/api/')) {
      const r = await handleApi(request, db, env);
      if (r) return r;
    }

    // ---------- OPENCODE STANDALONE CONTROL PANEL ----------
    // Separate from the SDK login. Admin password -> oc_admin cookie; panel
    // user id 1 can also enter directly from the main panel.
    if (path === '/opencode/login') {
      if (method === 'POST') {
        const rl = adminLoginRate(request);
        if (!rl.allowed) {
          return html(opencodeLoginPage({
            error: 'Too many attempts. Try again in a minute.',
            configured: adminPasswordConfigured(env),
          }), 429);
        }
        const p = await formParams(request);
        const check = await verifyAdminPassword(env, String(p.password || ''));
        if (!check.configured) {
          return html(opencodeLoginPage({
            error: 'Admin password is not configured. Set OPENCODE_ADMIN_PASSWORD on the Worker, or login to the main panel as owner.',
            configured: false,
          }));
        }
        if (!check.ok) {
          return html(opencodeLoginPage({
            error: 'Invalid admin password.',
            configured: true,
          }));
        }
        const token = await createOpenCodeAdminSession(db, request);
        return redir('/opencode', adminCookie(token, request));
      }
      if (await getOpenCodeAdminSession(db, request)) return redir('/opencode');
      return html(opencodeLoginPage({
        configured: adminPasswordConfigured(env),
        msg: url.searchParams.get('msg') || '',
      }));
    }
    if (path === '/opencode/logout') {
      await destroyOpenCodeAdminSession(db, request);
      return redir('/opencode/login?msg=' + encodeURIComponent('Signed out of the OpenCode control plane.'), clearAdminCookie(request));
    }
    const OC_PAGES = {
      '/opencode': { route: 'overview', title: 'Overview' },
      '/opencode/users': { route: 'users', title: 'App accounts' },
      '/opencode/notices': { route: 'notices', title: 'Notices' },
      '/opencode/settings': { route: 'settings', title: 'Settings' },
    };
    if (OC_PAGES[path]) {
      let actor = 'admin';
      const adminSession = await getOpenCodeAdminSession(db, request);
      if (!adminSession) {
        const sdkSession = await getSession(db, request);
        if (sdkSession && sdkSession.id === 1 && (sdkSession.is_blocked | 0) !== 1) actor = 'owner';
        else return redir('/opencode/login');
      }
      const page = OC_PAGES[path];
      if (method === 'POST') {
        const p = await formParams(request);
        const result = await applyOpenCodeAdminAction(db, p);
        const qs = new URLSearchParams();
        if (result.ok) qs.set('ok', result.ok);
        else qs.set('error', result.error || 'Action failed');
        if (page.route === 'users' && p.q) qs.set('q', String(p.q).slice(0, 80));
        return redir(path + '?' + qs.toString());
      }
      let data;
      let adminError = '';
      try {
        data = await getOpenCodeAdminData(db, url.searchParams.get('q') || '');
      } catch (e) {
        console.error('opencode admin data failed:', String(e?.message || e));
        data = { settings: {}, notices: [], users: [], stats: {} };
        adminError = 'OpenCode database is not ready: ' + String(e?.message || e).slice(0, 200);
      }
      const keyStatus = await opencodeKeyStatus(db, env).catch(() => ({ configured: true, source: 'default' }));
      const common = {
        ok: url.searchParams.get('ok') || '',
        error: adminError || url.searchParams.get('error') || '',
        q: url.searchParams.get('q') || '',
        actor,
        encOk: keyStatus.configured,
        encSource: keyStatus.source,
        adminSource: adminPasswordSource(env),
      };
      const content = page.route === 'users' ? opencodeUsersPage(data, common)
        : page.route === 'notices' ? opencodeNoticesPage(data, common)
          : page.route === 'settings' ? opencodeSettingsPage(data, common)
            : opencodeOverview(data, common);
      return html(opencodeAdminLayout({
        title: page.title,
        route: page.route,
        content,
        ok: common.ok,
        error: common.error,
        actor,
        encOk: common.encOk,
        encSource: common.encSource,
      }));
    }

    const uc = await db.prepare('SELECT COUNT(*) c FROM users').first().catch(() => ({ c: 1 }));
    if ((uc?.c || 0) === 0 && path !== '/setup') return redir('/setup');

    if (path === '/setup') {
      if ((uc?.c || 0) > 0) return redir('/login');
      if (method === 'POST') {
        const p = await formParams(request);
        const u = String(p.username || '').trim(), pw = String(p.password || '');
        if (u.length < 3 || pw.length < 4) return html(authPage({ mode: 'setup', error: 'Username min 3, password min 4.', panelName: envName }));
        if (await db.prepare('SELECT id FROM users WHERE username=?').bind(u).first().catch(() => null)) return html(authPage({ mode: 'setup', error: 'Username already hai.', panelName: envName }));
        const r = await db.prepare('INSERT INTO users (full_name,username,password_hash,role,panel_code,balance) VALUES (?,?,?,?,?,?)').bind('Setup Admin', u, await hashPassword(pw), 'PROFESSOR', mainPanel, 0).run();
        const t = crypto.randomUUID();
        await db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').bind(t, r.meta.last_row_id, Date.now() + 6048e5).run();
        return redir('/dashboard', sessCookie(t, request));
      }
      return html(authPage({ mode: 'setup', panelName: envName }));
    }
    if (path === '/login') {
      if (method === 'POST') {
        // FIX (brute-force): best-effort per-isolate throttle. Production must
        // also enable Cloudflare Rate Limiting on /login.
        const rl = hitRate('html-login:' + clientIp(request), 20, 60e3);
        if (!rl.allowed) return html(loginPage({ error: 'Too many attempts. Retry in a minute.', panelName: envName }));
        const p = await formParams(request);
        const u = String(p.username || '').trim(), pw = String(p.password || '');
        const row = await db.prepare('SELECT * FROM users WHERE username=?').bind(u).first().catch(() => null);
        if (!row || !(await verifyPassword(pw, row.password_hash))) return html(loginPage({ error: 'Invalid username or password', panelName: envName }));
        if ((row.is_blocked | 0) === 1) return html(loginPage({ error: 'Account suspended by Admin/Owner.', panelName: envName }));
        if (row.id === 1 || isProfessor(row)) {
          await db.prepare("UPDATE users SET device_fingerprint=?,last_login=datetime('now') WHERE id=?").bind(await deviceFingerprint(String(p.device_info || '{}'), request.headers.get('User-Agent'), request.headers.get('Accept-Language')), row.id).run();
        } else {
          const fp = await deviceFingerprint(String(p.device_info || '{}'), request.headers.get('User-Agent'), request.headers.get('Accept-Language'));
          if (!row.device_fingerprint) {
            await db.prepare("UPDATE users SET device_fingerprint=?,last_login=datetime('now') WHERE id=?").bind(fp, row.id).run();
          } else if (row.device_fingerprint !== fp) {
            return html(loginPage({ error: 'Account locked on another device.', errorLink: 'reset', panelName: envName }));
          } else {
            await db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").bind(row.id).run();
          }
        }
        const t = crypto.randomUUID();
        await db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').bind(t, row.id, Date.now() + 6048e5).run();
        return redir('/dashboard', sessCookie(t, request));
      }
      return html(loginPage({ msg: url.searchParams.get('msg') || '', panelName: envName }));
    }
    if (path === '/register') {
      if (method === 'POST') {
        const p = await formParams(request);
        const fn = String(p.full_name || '').trim(), u = String(p.username || '').trim(), pw = String(p.password || '');
        const code = String(p.referral_code || '').toUpperCase().replace(/\s+/g, '');
        if (!fn || u.length < 3 || pw.length < 4 || !code) return html(registerPage({ error: 'Saare fields sahi bharo (password min 4).', panelName: envName }));
        const ref = await db.prepare('SELECT * FROM referrals WHERE code=? AND used=0').bind(code).first().catch(() => null);
        if (!ref) return html(registerPage({ error: 'Invalid ya used referral code.', panelName: envName }));
        if (await db.prepare('SELECT id FROM users WHERE username=?').bind(u).first().catch(() => null)) return html(registerPage({ error: 'Username already taken.', panelName: envName }));
        const plim = (((await db.prepare('SELECT account_limit FROM panels WHERE panel_code=?').bind(ref.panel_code).first().catch(() => null)) || {}).account_limit) | 0;
        if (plim > 0) {
          const pcnt = ((await db.prepare('SELECT COUNT(*) c FROM users WHERE panel_code=?').bind(ref.panel_code).first().catch(() => ({ c: 0 }))).c) | 0;
          if (pcnt >= plim) return html(registerPage({ error: 'Tenant account limit full (' + pcnt + '/' + plim + ').', panelName: envName }));
        }
        const validity = new Date(Date.now() + (ref.duration | 0) * 864e5).toISOString().slice(0, 19).replace('T', ' ');
        // v1.3 single-professor policy: PROFESSOR is never mintable via
        // referral. OWNER/ADMIN/RESELLER codes are honoured only when the
        // minter is OWNER/PROFESSOR; ADMIN-minted + legacy codes stay
        // RESELLER-only so a leaked code can't escalate.
        const minter = ref.created_by ? await db.prepare('SELECT role FROM users WHERE id=?').bind(ref.created_by).first().catch(() => null) : null;
        const minterOwner = !!(minter && (minter.role === 'OWNER' || minter.role === 'PROFESSOR'));
        const wantRole = String(ref.role || '').toUpperCase();
        const regRole = minterOwner && ['OWNER', 'ADMIN', 'RESELLER'].includes(wantRole) ? wantRole : 'RESELLER';
        await db.prepare('INSERT INTO users (full_name,username,password_hash,role,invited_by,balance,validity,panel_code) VALUES (?,?,?,?,?,?,?,?)').bind(fn, u, await hashPassword(pw), regRole, ref.created_by || null, ref.balance | 0, validity, ref.panel_code).run();
        await db.prepare('UPDATE referrals SET used=1 WHERE code=?').bind(code).run();
        return redir('/login?msg=' + encodeURIComponent('Account created! Please login.'));
      }
      return html(registerPage({ panelName: envName }));
    }
    if (path === '/reset-device') {
      if (method === 'POST') {
        const p = await formParams(request);
        const u = String(p.username || '').trim(), pw = String(p.password || '');
        const row = await db.prepare('SELECT * FROM users WHERE username=?').bind(u).first().catch(() => null);
        if (!row || !(await verifyPassword(pw, row.password_hash))) return html(resetPage({ error: 'Invalid username or password', panelName: envName }));
        if ((row.is_blocked | 0) === 1) return html(resetPage({ error: 'Account suspended.', panelName: envName }));
        if (row.last_reset && tsMs(row.last_reset) + 864e5 > Date.now()) {
          const next = new Date(tsMs(row.last_reset) + 864e5 + 19800e3).toISOString().slice(0, 19).replace('T', ' ');
          return html(resetPage({ error: '24h me 1 baar hi reset. Next slot: ' + next + ' IST', panelName: envName }));
        }
        await db.prepare("UPDATE users SET device_fingerprint=NULL,last_reset=datetime('now') WHERE id=?").bind(row.id).run();
        return redir('/login?msg=' + encodeURIComponent('Device reset successful! You can now login on new device.'));
      }
      return html(resetPage({ panelName: envName }));
    }
    if (path === '/join-panel') {
      if (method === 'POST') {
        const p = await formParams(request);
        const pc = String(p.panel_code || '').toUpperCase().replace(/\s+/g, '');
        const u = String(p.username || '').trim(), pw = String(p.password || '');
        if (!pc || u.length < 3 || pw.length < 4) return html(joinPage({ error: 'Sahi panel code / username / password (min 4) do.', panelName: envName, keepCode: pc }));
        const prow = await db.prepare('SELECT * FROM panels WHERE panel_code=?').bind(pc).first().catch(() => null);
        if (!prow) return html(joinPage({ error: 'Panel not found.', panelName: envName, keepCode: pc }));
        const own = await db.prepare("SELECT id FROM users WHERE panel_code=? AND role IN ('OWNER','PROFESSOR')").bind(pc).first().catch(() => null);
        if (own) return html(joinPage({ error: 'Panel already claimed hai.', panelName: envName, keepCode: pc }));
        if (await db.prepare('SELECT id FROM users WHERE username=?').bind(u).first().catch(() => null)) return html(joinPage({ error: 'Username taken.', panelName: envName, keepCode: pc }));
        const lim = prow.account_limit | 0;
        if (lim > 0) {
          const cnt = ((await db.prepare('SELECT COUNT(*) c FROM users WHERE panel_code=?').bind(pc).first().catch(() => ({ c: 0 }))).c) | 0;
          if (cnt >= lim) return html(joinPage({ error: 'Tenant account limit full (' + cnt + '/' + lim + ').', panelName: envName, keepCode: pc }));
        }
        await db.prepare('INSERT INTO users (full_name,username,password_hash,role,balance,validity,panel_code) VALUES (?,?,?,?,?,?,?)').bind(pc + ' Admin', u, await hashPassword(pw), 'OWNER', 999999, prow.expires_at || null, pc).run();
        // Owner panel default: exactly one account (the owner). Admin can raise
        // the limit from the Tenants page; a pre-set limit is respected.
        await db.prepare('UPDATE panels SET account_limit=1 WHERE panel_code=? AND (account_limit IS NULL OR account_limit=0)').bind(pc).run().catch(() => {});
        return redir('/login?msg=' + encodeURIComponent('Panel claimed! Please login.'));
      }
      const defRow = await db.prepare('SELECT panel_code FROM panels WHERE auto_join=1 LIMIT 1').first().catch(() => null);
      return html(joinPage({ panelName: envName, defaultCode: (defRow && defRow.panel_code) || '' }));
    }
    if (path === '/logout') {
      const t = parseCookies(request)['sdk_session'];
      if (t) await db.prepare('DELETE FROM sessions WHERE token=?').bind(t).run().catch(() => {});
      return redir('/login', clearCookie());
    }

    const sess = await getSession(db, request);
    if (!sess) return redir('/login');
    if ((sess.is_blocked | 0) === 1) {
      const t = parseCookies(request)['sdk_session'];
      if (t) await db.prepare('DELETE FROM sessions WHERE token=?').bind(t).run().catch(() => {});
      return redir('/login?msg=' + encodeURIComponent('You have been logged out. Account is Blocked.'), clearCookie());
    }
    const myPanel = sess.panel_code || mainPanel;
    const myId = sess.id, myRole = sess.role;
    // Role hierarchy: PROFESSOR > OWNER > ADMIN > RESELLER.
    const isOA = myRole === 'OWNER' || myRole === 'ADMIN' || myRole === 'PROFESSOR';
    const isOwnerLike = myRole === 'OWNER' || myRole === 'PROFESSOR';
    const P = async (route, title, content) => html(panelLayout({ title, route, sess, panelName: await panelName(db, myPanel, envName), content, theme: await getTheme(db, myPanel), accent: await getAccent(db, myPanel) }));
    const S = async (route, title, content) => html(layout({ title, route, username: sess.username, panelCode: myPanel, panelName: envName, content, theme: await getTheme(db, myPanel), accent: await getAccent(db, myPanel) }));
    const needOA = () => { if (!isOA) return deny(); return null; };
    const needOwner = () => { if (!isOwnerLike) return deny(); return null; };

    // ---------- PANEL DASHBOARD ----------
    if (path === '/' || path === '/dashboard') {
      const me = await db.prepare('SELECT balance FROM users WHERE id=?').bind(myId).first().catch(() => ({}));
      const balanceText = isOwnerLike ? 'UNLIMITED' : Number(me?.balance || 0).toLocaleString('en-IN');
      let stats = {};
      if (isOwnerLike) {
        const r = await db.prepare("SELECT (SELECT COUNT(*) FROM users WHERE panel_code=? AND role='ADMIN') a,(SELECT COUNT(*) FROM users WHERE panel_code=? AND role='RESELLER') r,(SELECT COUNT(*) FROM api_keys WHERE panel_code=?) t,(SELECT COUNT(*) FROM api_keys k JOIN users u ON k.created_by=u.id WHERE k.panel_code=? AND u.role='ADMIN') ak,(SELECT COUNT(*) FROM api_keys k JOIN users u ON k.created_by=u.id WHERE k.panel_code=? AND u.role='RESELLER') rk,(SELECT COUNT(*) FROM api_keys WHERE panel_code=? AND is_blocked=0) ac").bind(myPanel, myPanel, myPanel, myPanel, myPanel, myPanel).first().catch(() => ({}));
        stats = { total_admins: r?.a || 0, total_resellers: r?.r || 0, total_keys: r?.t || 0, admin_keys: r?.ak || 0, reseller_keys: r?.rk || 0, active_keys: r?.ac || 0 };
      } else if (myRole === 'ADMIN') {
        const r = await db.prepare("SELECT (SELECT COUNT(*) FROM users WHERE panel_code=? AND role='RESELLER' AND invited_by=?) a,(SELECT COUNT(*) FROM api_keys WHERE panel_code=? AND created_by=?) b,(SELECT COUNT(*) FROM api_keys k JOIN users u ON k.created_by=u.id WHERE k.panel_code=? AND u.role='RESELLER' AND u.invited_by=?) c,(SELECT COUNT(*) FROM api_keys WHERE panel_code=? AND created_by=? AND is_blocked=0) d").bind(myPanel, myId, myPanel, myId, myPanel, myId, myPanel, myId).first().catch(() => ({}));
        stats = { my_resellers: r?.a || 0, my_keys: r?.b || 0, my_reseller_keys: r?.c || 0, my_active_keys: r?.d || 0, team_keys: (r?.b || 0) + (r?.c || 0) };
      } else {
        const r = await db.prepare('SELECT (SELECT COUNT(*) FROM api_keys WHERE panel_code=? AND created_by=?) a,(SELECT COUNT(*) FROM api_keys WHERE panel_code=? AND created_by=? AND is_blocked=0) b').bind(myPanel, myId, myPanel, myId).first().catch(() => ({}));
        stats = { my_keys: r?.a || 0, my_active_keys: r?.b || 0 };
      }
      return P('dashboard', 'Dashboard', panelDashboard(sess, stats, balanceText));
    }

    // ---------- PANEL GENERATE ----------
    if (path === '/generate') {
      let ok = '', error = '', keys = [];
      if (method === 'POST') {
        const p = await formParams(request);
        const dur = String(p.duration || '');
        const limit = Math.min(10, Math.max(1, parseInt(p.device_limit, 10) || 1));
        let amount = Math.min(500, Math.max(1, parseInt(p.bulk_amount, 10) || 1));
        if (p.is_bulk == null && amount <= 1) amount = 1;
        let custom = String(p.custom_key || '').trim();
        let server = 'PRIVATE';
        if (isOwnerLike) {
          const s = String(p.server_type || 'PRIVATE').toUpperCase();
          if (/^[A-Z0-9 _.-]{1,30}$/.test(s)) {
            if (['ADMIN', 'SAFE', 'PRIVATE', 'PUBLIC'].includes(s)) server = s;
            else if (await db.prepare('SELECT id FROM mod_versions WHERE panel_code=? AND UPPER(name)=?').bind(myPanel, s).first().catch(() => null)) server = s;
          }
        }
        if (!KEY_DURATIONS.includes(dur)) error = 'Invalid duration.';
        else if (amount === 1 && custom && custom.length > 50) error = 'Custom key max 50 chars.';
        else {
          const prow = await db.prepare('SELECT panel_code FROM panels WHERE panel_code=?').bind(myPanel).first().catch(() => null);
          if (!prow) error = "Panel '" + myPanel + "' database me nahi mila. Owner se panel create karwao.";
          else {
            const total = (KEY_PRICING[dur] || 10) * limit * amount;
            if (!isOwnerLike) {
              const me = await db.prepare('SELECT balance FROM users WHERE id=?').bind(myId).first().catch(() => ({}));
              if ((me?.balance | 0) < total) error = 'Insufficient balance! Need Rs ' + total + ' for ' + amount + ' key(s).';
            }
            if (!error) {
              if (!isOwnerLike) await db.prepare('UPDATE users SET balance=balance-? WHERE id=? AND balance>=?').bind(total, myId, total).run();
              const mkStmt = (kv) => db.prepare('INSERT INTO api_keys (key_value,duration,device_limit,panel_code,created_by,server_type) VALUES (?,?,?,?,?,?)').bind(kv, dur, limit, myPanel, myId, server);
              if (amount === 1 && custom) {
                try { await mkStmt(custom).run(); keys.push(custom); }
                catch (e) { error = 'Duplicate key. Try another custom key.'; }
              } else {
                const seen = new Set(), cands = [];
                for (let i = 0; i < amount; i++) { let kv; do { kv = dur + '-' + arcxRand(12); } while (seen.has(kv)); seen.add(kv); cands.push(kv); }
                const put = async (list) => {
                  const res = await Promise.allSettled(list.map(kv => mkStmt(kv).run()));
                  const failed = [];
                  res.forEach((r, j) => { if (r.status === 'fulfilled') keys.push(list[j]); else failed.push(list[j]); });
                  return failed;
                };
                let failed = [];
                for (let i = 0; i < cands.length; i += 50) failed = failed.concat(await put(cands.slice(i, i + 50)));
                if (failed.length) {
                  const retry = [];
                  for (let i = 0; i < failed.length; i++) { let kv; do { kv = dur + '-' + arcxRand(12); } while (seen.has(kv)); seen.add(kv); retry.push(kv); }
                  failed = await put(retry);
                }
                if (failed.length) error = failed.length + ' keys failed (duplicate), baaki ban gayi.';
              }
              if (keys.length && !error) ok = keys.length + ' key(s) generated (' + dur + ', ' + limit + ' device).';
              else if (keys.length && error) ok = keys.length + ' key(s) generated (' + dur + ', ' + limit + ' device).';
            }
          }
        }
      }
      await ensureModVersions(db, myPanel);
      const gvers = await db.prepare('SELECT name,tag FROM mod_versions WHERE panel_code=? ORDER BY sort ASC, id ASC').bind(myPanel).all().then(r => r.results || []).catch(() => []);
      return P('generate', 'Generate Keys', panelGenerate(sess, { ok, error, keys, versions: gvers }));
    }

    // ---------- PANEL KEY LIST ----------
    if (path === '/keys') {
      let ok = '', error = '';
      const canMod = async (kid) => {
        const k = await db.prepare('SELECT * FROM api_keys WHERE id=? AND panel_code=?').bind(kid, myPanel).first().catch(() => null);
        if (!k) return null;
        if (isOwnerLike) return k;
        if (k.created_by === myId) return k;
        if (myRole === 'ADMIN') { const c = await db.prepare('SELECT invited_by FROM users WHERE id=?').bind(k.created_by).first().catch(() => null); if (c && (c.invited_by | 0) === myId) return k; }
        return null;
      };
      if (method === 'POST') {
        const p = await formParams(request);
        const a = p.action;
        if (p.bulk && isOwnerLike) {
          if (a === 'delete_all') { await db.prepare('DELETE FROM api_keys WHERE panel_code=?').bind(myPanel).run(); ok = 'All panel keys deleted.'; }
          else if (a === 'delete_expired') { await db.prepare("DELETE FROM api_keys WHERE panel_code=? AND expires_at IS NOT NULL AND expires_at<datetime('now')").bind(myPanel).run(); ok = 'Expired keys deleted.'; }
          else if (a === 'extend_all') {
            const v = parseInt(p.extend_val, 10) || 0, u = String(p.extend_unit || 'D').toUpperCase() === 'H' ? 'hours' : 'days';
            if (v > 0) { await db.prepare("UPDATE api_keys SET expires_at=datetime(COALESCE(expires_at,'now'),?) WHERE panel_code=?").bind('+' + v + ' ' + u, myPanel).run(); ok = 'All keys extended +' + v + u[0] + '.'; }
          }
        } else if (a === 'reset_device' && p.key_id) {
          if (await canMod(+p.key_id)) { await db.prepare('DELETE FROM key_devices WHERE key_id=?').bind(+p.key_id).run(); ok = 'Devices reset.'; } else error = 'Not allowed.';
        } else if (a === 'delete_key' && p.key_id) {
          if (await canMod(+p.key_id)) { await db.prepare('DELETE FROM api_keys WHERE id=?').bind(+p.key_id).run(); ok = 'Key deleted.'; } else error = 'Not allowed.';
        } else if (a === 'edit_key' && p.key_id) {
          const k = await canMod(+p.key_id);
          if (!k) error = 'Not allowed.';
          else {
            const blk = String(p.edit_status) === '0' ? 1 : 0;
            const ev = parseInt(p.extend_val, 10) || 0, eu = String(p.extend_unit || 'D').toUpperCase() === 'H' ? 'hours' : 'days';
            await db.prepare('UPDATE api_keys SET is_blocked=? WHERE id=?').bind(blk, k.id).run();
            if (ev > 0) {
              // FIX: never mangle duration on pending keys ('30D+5D' fails the
              // first-use parser -> 500). Materialise a real expires_at instead.
              if (!k.expires_at) {
                const dm = String(k.duration || '').toUpperCase().match(/^(\d+)([DH])$/);
                const base = dm ? (dm[2] === 'D' ? (+dm[1]) * 864e5 : (+dm[1]) * 36e5) : 0;
                const exp = new Date(Date.now() + base + (eu === 'hours' ? ev * 36e5 : ev * 864e5)).toISOString().slice(0, 19).replace('T', ' ');
                await db.prepare('UPDATE api_keys SET expires_at=? WHERE id=?').bind(exp, k.id).run();
              } else await db.prepare("UPDATE api_keys SET expires_at=datetime(expires_at,?) WHERE id=?").bind('+' + ev + ' ' + eu, k.id).run();
            }
            if (isOwnerLike && p.edit_server) {
              const es = String(p.edit_server).toUpperCase();
              if (/^[A-Z0-9 _.-]{1,30}$/.test(es) && (['PRIVATE', 'PUBLIC', 'ADMIN', 'SAFE'].includes(es) || await db.prepare('SELECT id FROM mod_versions WHERE panel_code=? AND UPPER(name)=?').bind(myPanel, es).first().catch(() => null))) await db.prepare('UPDATE api_keys SET server_type=? WHERE id=?').bind(es, k.id).run();
            }
            ok = 'Key updated.';
          }
        }
      }
      let q = 'SELECT k.*,(SELECT COUNT(*) FROM key_devices d WHERE d.key_id=k.id) dev_count,(SELECT username FROM users WHERE id=k.created_by) creator FROM api_keys k WHERE k.panel_code=? ';
      const args = [myPanel];
      if (myRole === 'ADMIN') { q += 'AND (k.created_by=? OR k.created_by IN (SELECT id FROM users WHERE invited_by=?)) '; args.push(myId, myId); }
      else if (myRole === 'RESELLER') { q += 'AND k.created_by=? '; args.push(myId); }
      q += 'ORDER BY k.id DESC LIMIT 200';
      const rows = (await db.prepare(q).bind(...args).all().catch(() => ({ results: [] }))).results || [];
      const kvers = await db.prepare('SELECT name,tag FROM mod_versions WHERE panel_code=? ORDER BY sort ASC, id ASC').bind(myPanel).all().then(r => r.results || []).catch(() => []);
      return P('keys', 'Key Manager', panelKeyList(sess, rows, { ok, error, versions: kvers }));
    }

    // ---------- USERS ----------
    if (path === '/users') {
      if (needOA()) return deny();
      let ok = '', error = '';
      if (method === 'POST') {
        const p = await formParams(request);
        const tid = parseInt(p.target_id, 10) || 0, amt = Math.abs(parseInt(p.amount, 10) || 0);
        const t = tid ? await db.prepare('SELECT * FROM users WHERE id=? AND panel_code=?').bind(tid, myPanel).first().catch(() => null) : null;
        const tIsOwnReseller = t && t.role === 'RESELLER' && (t.invited_by | 0) === myId;
        if (!t) error = 'User not found.';
        // FIX: ReferenceError `allowed` removed (crashed every POST). Role
        // hierarchy: PROFESSOR > OWNER > ADMIN > RESELLER. Nobody below
        // PROFESSOR may mutate a PROFESSOR account.
        else if (t.role === 'PROFESSOR' && !isProfessor(sess)) error = 'Not allowed.';
        else if (myRole === 'ADMIN' && (t.role === 'OWNER' || t.role === 'PROFESSOR' || (t.id !== myId && !tIsOwnReseller))) error = 'Not allowed.';
        else if (p.action === 'toggle_block') {
          if (t.id === myId) error = 'Self block nahi.';
          else { await db.prepare('UPDATE users SET is_blocked=1-is_blocked WHERE id=?').bind(tid).run(); ok = 'Block toggled.'; }
        } else if ((p.action === 'add_balance' || p.action === 'deduct_balance') && amt > 0) {
          await db.prepare(p.action === 'add_balance' ? 'UPDATE users SET balance=balance+? WHERE id=?' : 'UPDATE users SET balance=CASE WHEN balance-?<0 THEN 0 ELSE balance-? END WHERE id=?').bind(...(p.action === 'add_balance' ? [amt, tid] : [amt, amt, tid])).run(); ok = 'Balance updated.';
        }
      }
      let list;
      if (myRole === 'OWNER' || myRole === 'PROFESSOR') list = (await db.prepare("SELECT u.*,(SELECT username FROM users WHERE id=u.invited_by) invited FROM users u WHERE u.panel_code=? ORDER BY u.id DESC LIMIT 200").bind(myPanel).all().catch(() => ({ results: [] }))).results || [];
      else list = (await db.prepare("SELECT u.*,(SELECT username FROM users WHERE id=u.invited_by) invited FROM users u WHERE u.panel_code=? AND (u.id=? OR (u.role='RESELLER' AND u.invited_by=?)) ORDER BY u.id DESC").bind(myPanel, myId, myId).all().catch(() => ({ results: [] }))).results || [];
      return P('users', 'User Management', usersPage(sess, list, { ok, error }));
    }

    // ---------- ADMINS ----------
    if (path === '/admins') {
      if (needOwner()) return deny();
      let ok = '';
      if (method === 'POST') {
        const p = await formParams(request);
        const vk = await db.prepare('SELECT id FROM api_keys WHERE id=? AND panel_code=?').bind(parseInt(p.key_id, 10) || 0, myPanel).first().catch(() => null);
        if (vk) {
          if (p.action === 'toggle_key_block') await db.prepare('UPDATE api_keys SET is_blocked=1-is_blocked WHERE id=?').bind(vk.id).run();
          else if (p.action === 'delete_key') await db.prepare('DELETE FROM api_keys WHERE id=?').bind(vk.id).run();
          ok = 'Done.';
        }
        if (p.target_user_id) return redir('/admins?view_keys=' + encodeURIComponent(p.target_user_id));
      }
      const vid = parseInt(url.searchParams.get('view_keys') || '0', 10);
      if (vid) {
        const vu = await db.prepare("SELECT * FROM users WHERE id=? AND panel_code=? AND role IN ('ADMIN','RESELLER')").bind(vid, myPanel).first().catch(() => null);
        if (!vu) return redir('/admins');
        const vks = (await db.prepare('SELECT * FROM api_keys WHERE created_by=? AND panel_code=? ORDER BY id DESC LIMIT 200').bind(vid, myPanel).all().catch(() => ({ results: [] }))).results || [];
        return P('admins', 'Admin Manager', adminsPage([], vu, vks, { ok }));
      }
      const list = (await db.prepare("SELECT u.*,(SELECT COUNT(*) FROM api_keys WHERE created_by=u.id) total_keys FROM users u WHERE u.panel_code=? AND u.role IN ('ADMIN','RESELLER') AND u.id!=? ORDER BY u.id DESC").bind(myPanel, myId).all().catch(() => ({ results: [] }))).results || [];
      return P('admins', 'Admin Manager', adminsPage(list, null, [], { ok }));
    }

    // ---------- PERMISSIONS ----------
    if (path === '/permissions') {
      if (needOwner()) return deny();
      let ok = '';
      if (method === 'POST') {
        const p = await formParams(request);
        const tid = parseInt(p.target_id, 10) || 0;
        if (tid && tid !== myId) {
          if (p.action === 'toggle_ref') await db.prepare('UPDATE users SET can_generate_referral=1-can_generate_referral WHERE id=? AND panel_code=?').bind(tid, myPanel).run();
          else if (p.action === 'update_limit') await db.prepare('UPDATE users SET referral_limit=? WHERE id=? AND panel_code=?').bind(Math.max(0, parseInt(p.ref_limit, 10) || 0), tid, myPanel).run();
          ok = 'Saved.';
        }
      }
      const list = (await db.prepare("SELECT * FROM users WHERE panel_code=? AND role IN ('ADMIN','RESELLER') AND id!=? ORDER BY id DESC").bind(myPanel, myId).all().catch(() => ({ results: [] }))).results || [];
      return P('permissions', 'Permission', permissionsPage(list, { ok }));
    }

    // ---------- REFERRAL ----------
    if (path === '/referral') {
      if (needOA()) return deny();
      let ok = '', error = '';
      // Admin referral quota (owner-set): fetched once per request, reused by
      // both the generate action and the page banner.
      let me = null, used = 0;
      if (!isOwnerLike) {
        me = await db.prepare('SELECT can_generate_referral,referral_limit FROM users WHERE id=?').bind(myId).first().catch(() => ({}));
        used = ((await db.prepare('SELECT COUNT(*) c FROM referrals WHERE created_by=?').bind(myId).first().catch(() => ({ c: 0 }))).c) | 0;
      }
      if (method === 'POST') {
        const p = await formParams(request);
        if (p.action === 'generate') {
          const rr = String(p.role || 'RESELLER').toUpperCase();
          // v1.3: owner/professor may mint OWNER/ADMIN/RESELLER codes; admin
          // only RESELLER. PROFESSOR is never mintable (single professor).
          const role = (isOwnerLike && ['OWNER', 'ADMIN', 'RESELLER'].includes(rr)) ? rr : 'RESELLER';
          const dur = Math.max(1, parseInt(p.duration, 10) || 30), bal = Math.max(0, parseInt(p.balance, 10) || 0);
          if (!isOwnerLike) {
            if (!(me?.can_generate_referral | 0)) error = 'Referral generation disabled for you.';
            else if ((me?.referral_limit | 0) > 0 && used >= (me.referral_limit | 0)) error = 'Referral limit reached.';
          }
          if (!error) {
            const rb = new Uint8Array(4); crypto.getRandomValues(rb);
            const code = 'REF-' + [...rb].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
            await db.prepare('INSERT INTO referrals (code,role,duration,balance,panel_code,created_by) VALUES (?,?,?,?,?,?)').bind(code, role, dur, bal, myPanel, myId).run();
            ok = code;
          }
        } else if (p.action === 'delete_ref' && p.del_code) {
          if (isOwnerLike) await db.prepare('DELETE FROM referrals WHERE code=? AND panel_code=?').bind(String(p.del_code), myPanel).run();
          else await db.prepare('DELETE FROM referrals WHERE code=? AND created_by=?').bind(String(p.del_code), myId).run();
          return redir('/referral');
        } else if ((p.action === 'toggle_ref' || p.action === 'update_limit') && isOwnerLike) {
          // Owner controls how many resellers an Admin may mint (0 = ∞).
          const tid = parseInt(p.target_id, 10) || 0;
          if (tid && tid !== myId) {
            if (p.action === 'toggle_ref') await db.prepare('UPDATE users SET can_generate_referral=1-can_generate_referral WHERE id=? AND panel_code=?').bind(tid, myPanel).run();
            else await db.prepare('UPDATE users SET referral_limit=? WHERE id=? AND panel_code=?').bind(Math.max(0, parseInt(p.ref_limit, 10) || 0), tid, myPanel).run();
            ok = 'Saved.';
          }
        }
      }
      const list = isOwnerLike
        ? (await db.prepare('SELECT * FROM referrals WHERE panel_code=? ORDER BY rowid DESC LIMIT 200').bind(myPanel).all().catch(() => ({ results: [] }))).results || []
        : (await db.prepare('SELECT * FROM referrals WHERE created_by=? ORDER BY rowid DESC LIMIT 200').bind(myId).all().catch(() => ({ results: [] }))).results || [];
      const admins = isOwnerLike
        ? (await db.prepare("SELECT id,username,role,can_generate_referral,referral_limit FROM users WHERE panel_code=? AND role='ADMIN' AND id!=? ORDER BY id DESC LIMIT 50").bind(myPanel, myId).all().catch(() => ({ results: [] }))).results || []
        : [];
      const quota = isOwnerLike ? null : { can: !!(me?.can_generate_referral | 0), limit: me?.referral_limit | 0, used };
      return P('referral', 'Referrals', referralPage(sess, list, { ok, error, quota, admins }));
    }

    // ---------- AES ----------
    if (path === '/aes') {
      if (needOwner()) return deny();
      let ok = '', error = '';
      if (method === 'POST') {
        const p = await formParams(request);
        if (p.action === 'generate_apk_keys') {
          if (myId !== 1 && !isProfessor(sess)) error = 'Only main owner.';
          else {
            const makeKey = (len) => {
              const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
              const rb = new Uint8Array(len); crypto.getRandomValues(rb);
              let s = '';
              for (let i = 0; i < len; i++) s += chars[rb[i] % chars.length];
              return s;
            };
            const l1 = makeKey(32);
            const l2 = makeKey(32);
            await db.prepare('INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES (?,?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value').bind('aes_key_l1', l1, myPanel).run();
            await db.prepare('INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES (?,?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value').bind('aes_key_l2', l2, myPanel).run();
            ok = 'APK AES keys generated. Copy L1 and L2 into C++ main.cpp (AES_KEY_L1 / AES_KEY_L2) and rebuild: <br><b>L1:</b> ' + l1 + ' <br><b>L2:</b> ' + l2;
          }
        } else if (p.action === 'generate_activation') {
          if (myId !== 1 && !isProfessor(sess)) error = 'Only main owner.';
          else {
            const key = arcxRand(14), months = Math.min(120, Math.max(1, parseInt(p.duration, 10) || 1));
            const exp = new Date(Date.now() + months * 30 * 864e5).toISOString().slice(0, 19).replace('T', ' ');
            await db.prepare('INSERT INTO activation_keys (activation_key,panel_code,name,duration_months,expires_at) VALUES (?,?,?,?,?)').bind(key, myPanel, String(p.key_name || '').slice(0, 50), months, exp).run();
            ok = key;
          }
        } else if (p.action === 'delete_activation') {
          if (myId !== 1 && !isProfessor(sess)) error = 'Only main owner.';
          else { await db.prepare('DELETE FROM activation_keys WHERE activation_key=?').bind(String(p.del_key || '').trim().toUpperCase()).run(); ok = 'Activation key deleted.'; }
        } else if (p.action === 'redeem_activation') {
          const k = String(p.activation_key || '').trim().toUpperCase();
          const row = await db.prepare('SELECT * FROM activation_keys WHERE activation_key=? AND is_used=0').bind(k).first().catch(() => null);
          if (!row) error = 'Invalid / used key.';
          else {
            await db.prepare("UPDATE activation_keys SET is_used=1,used_by=?,used_at=datetime('now') WHERE activation_key=?").bind(myPanel, k).run();
            await db.prepare('UPDATE users SET panel_expiry=? WHERE panel_code=?').bind(row.expires_at, myPanel).run();
            ok = 'Panel activated till ' + row.expires_at;
          }
        }
      }
      const s = await db.prepare('SELECT setting_name,setting_value FROM mod_settings WHERE panel_code=? AND setting_name IN (?,?)').bind(myPanel, 'aes_key_l1', 'aes_key_l2').all().then(r => Object.fromEntries((r.results || []).map(x => [x.setting_name, x.setting_value]))).catch(() => ({}));
      const me = await db.prepare('SELECT panel_expiry FROM users WHERE id=?').bind(myId).first().catch(() => ({}));
      const canSeeActivations = myId === 1 || isProfessor(sess);
      const recent = canSeeActivations ? (await db.prepare('SELECT * FROM activation_keys ORDER BY id DESC LIMIT 10').all().catch(() => ({ results: [] }))).results || [] : [];
      return P('aes', 'API Encryption', aesPage({ ok, error, aesKeyL1: s.aes_key_l1, aesKeyL2: s.aes_key_l2, expiry: me?.panel_expiry, recent }, canSeeActivations));
    }

    // ---------- API TEST ----------
    if (path === '/api-test') {
      if (needOA()) return deny();
      const base = 'https://' + url.host;
      return P('api-test', 'Live API Tester', apiTestPage({ connect: base + '/connect/' + myPanel, encrypt: base + '/encrypt/' + myPanel }));
    }

    // ---------- SERVER ----------
    if (path === '/server') {
      if (needOA()) return deny();
      let ok = '';
      if (method === 'POST') {
        const p = await formParams(request);
        const on = p.maintenance_mode != null ? 1 : 0;
        await db.prepare('INSERT INTO mod_maintenance (panel_code,is_active,reason) VALUES (?,?,?) ON CONFLICT(panel_code) DO UPDATE SET is_active=excluded.is_active,reason=excluded.reason').bind(myPanel, on, String(p.maintenance_reason || '').slice(0, 255)).run();
        for (const k of MOD_FIELDS) {
          const v = ['ESP', 'Item', 'AIM', 'SilentAim', 'BulletTrack', 'Floating', 'Memory', 'Setting'].includes(k) ? (p[k] != null ? 'on' : 'off') : String(p[k] ?? '').slice(0, 255);
          if (p[k] !== undefined || ['ESP', 'Item', 'AIM', 'SilentAim', 'BulletTrack', 'Floating', 'Memory', 'Setting'].includes(k))
            await db.prepare('INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES (?,?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value').bind(k, v, myPanel).run();
        }
        ok = 'Server config saved.';
      }
      const s = await db.prepare('SELECT setting_name,setting_value FROM mod_settings WHERE panel_code=?').bind(myPanel).all().then(r => Object.fromEntries((r.results || []).map(x => [x.setting_name, x.setting_value]))).catch(() => ({}));
      const m = await db.prepare('SELECT * FROM mod_maintenance WHERE panel_code=?').bind(myPanel).first().catch(() => null);
      return P('server', 'Server & Mod', serverPage(s, { on: m ? (m.is_active | 0) : 0, reason: m?.reason || '' }, { ok }));
    }

    // ---------- SETTINGS ----------
    if (path === '/settings') {
      let ok = '', error = '';
      if (method === 'POST') {
        const p = await formParams(request);
        if (p.action === 'update_password') {
          const me = await db.prepare('SELECT password_hash FROM users WHERE id=?').bind(myId).first().catch(() => null);
          if (!me || !(await verifyPassword(String(p.current_password || ''), me.password_hash))) error = 'Current password galat.';
          else if (String(p.new_password || '').length < 4) error = 'New password min 4.';
          else { await db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(String(p.new_password)), myId).run(); ok = 'Password updated.'; }
        } else if (p.action === 'update_branding' && isOwnerLike) {
          await db.prepare('INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES (?,?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value').bind('panel_name', String(p.panel_name || '').slice(0, 50), myPanel).run(); ok = 'Panel name saved.';
        } else if (p.action === 'update_theme' && isOwnerLike) {
          const t = String(p.ui_theme || 'blue');
          if (t === 'custom') {
            const hx = String(p.ui_accent || '').trim().toLowerCase();
            if (!HEX6.test(hx)) error = 'Invalid color. Picker se dobara chuno (#RRGGBB).';
            else {
              await db.prepare('INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES (?,?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value').bind('ui_theme', 'custom', myPanel).run();
              await db.prepare('INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES (?,?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value').bind('ui_accent', hx, myPanel).run();
              ok = 'Custom color applied.';
            }
          } else if (!THEMES.includes(t)) error = 'Invalid theme.';
          else { await db.prepare('INSERT INTO mod_settings (setting_name,setting_value,panel_code) VALUES (?,?,?) ON CONFLICT(setting_name,panel_code) DO UPDATE SET setting_value=excluded.setting_value').bind('ui_theme', t, myPanel).run(); ok = 'Theme applied.'; }
        }
      }
      const base = 'https://' + url.host;
      const pn = await panelName(db, myPanel, envName);
      const thName = await getTheme(db, myPanel);
      const thAcc = await getAccent(db, myPanel);
      return P('settings', 'Settings', settingsPage(sess, { ok, error, panelName: pn }, { connect: base + '/connect/' + myPanel, encrypt: base + '/encrypt/' + myPanel }, { name: thName, accent: thAcc ? thAcc.acc : null }));
    }

    // ---------- LOADER / MOD VERSIONS ----------
    if (path === '/loader-manager') {
      if (needOA()) return deny();
      let ok = '', error = '';
      const nameOk = (s) => /^[A-Z0-9][A-Z0-9 _.-]{0,29}$/.test(s);
      const tagOk = (s) => s === '' || /^[A-Z0-9 _.-]{1,20}$/.test(s);
      const urlOk = (s) => libUrlOk(s, { allowEmpty: true });
      const vTaken = async (nm, exId) => !!(await db.prepare('SELECT id FROM mod_versions WHERE panel_code=? AND UPPER(name)=UPPER(?)' + (exId ? ' AND id<>?' : '')).bind(...(exId ? [myPanel, nm, exId] : [myPanel, nm])).first().catch(() => null));
      await ensureModVersions(db, myPanel);
      if (method === 'POST') {
        const p = await formParams(request);
        if (p.form_type === 'loader_config') {
          const v = Math.max(1.0, parseFloat(p.version) || 1.0);
          await db.prepare('INSERT INTO loader_config (panel_code,version) VALUES (?,?) ON CONFLICT(panel_code) DO UPDATE SET version=excluded.version').bind(myPanel, v).run(); ok = 'Version saved.';
        } else if (p.form_type === 'version_add') {
          const nm = String(p.name || '').trim().toUpperCase().slice(0, 30);
          const tg = String(p.tag || '').trim().toUpperCase().slice(0, 20);
          if (!nameOk(nm)) error = 'Name 1-30: letters/numbers/space . _ -';
          else if (!tagOk(tg)) error = 'Tag max 20: letters/numbers/space . _ -';
          else if (await vTaken(nm)) error = 'Version "' + nm + '" already exists.';
          else {
            const mx = await db.prepare('SELECT COALESCE(MAX(sort),-1) m FROM mod_versions WHERE panel_code=?').bind(myPanel).first().catch(() => ({}));
            await db.prepare('INSERT INTO mod_versions (panel_code,name,tag,url,sort) VALUES (?,?,?,?,?)').bind(myPanel, nm, tg, '', (mx?.m | 0) + 1).run();
            ok = nm + ' added — URL Mod URL tab me set karo.';
          }
        } else if (p.form_type === 'version_save') {
          const id = parseInt(p.id, 10) || 0;
          const row = await db.prepare('SELECT id FROM mod_versions WHERE id=? AND panel_code=?').bind(id, myPanel).first().catch(() => null);
          const nm = String(p.name || '').trim().toUpperCase().slice(0, 30);
          const tg = String(p.tag || '').trim().toUpperCase().slice(0, 20);
          const u = String(p.url || '').trim().slice(0, 500);
          if (!row) error = 'Version nahi mila.';
          else if (!nameOk(nm)) error = 'Name 1-30: letters/numbers/space . _ -';
          else if (!tagOk(tg)) error = 'Tag max 20: letters/numbers/space . _ -';
          else if (!urlOk(u)) error = 'Valid https:// URL do (public host, jaise https://cdn.example.com/lib.zip).';
          else if (await vTaken(nm, id)) error = 'Version "' + nm + '" already exists.';
          else {
            await db.prepare('UPDATE mod_versions SET name=?,tag=?,url=? WHERE id=? AND panel_code=?').bind(nm, tg, u, id, myPanel).run();
            ok = nm + ' saved.';
          }
        } else if (p.form_type === 'version_del') {
          const id = parseInt(p.id, 10) || 0;
          await db.prepare('DELETE FROM mod_versions WHERE id=? AND panel_code=?').bind(id, myPanel).run();
          ok = 'Version deleted.';
        } else if (p.form_type === 'tag_add') {
          const nm = String(p.name || '').trim().toUpperCase().slice(0, 20);
          if (!/^[A-Z0-9][A-Z0-9 _.-]{0,19}$/.test(nm)) error = 'Tag 1-20: letters/numbers/space . _ -';
          else {
            const ex = await db.prepare('SELECT id FROM mod_tags WHERE panel_code=? AND UPPER(name)=UPPER(?)').bind(myPanel, nm).first().catch(() => null);
            if (ex) error = 'Tag "' + nm + '" already exists.';
            else {
              const mx = await db.prepare('SELECT COALESCE(MAX(sort),-1) m FROM mod_tags WHERE panel_code=?').bind(myPanel).first().catch(() => ({}));
              await db.prepare('INSERT INTO mod_tags (panel_code,name,sort) VALUES (?,?,?)').bind(myPanel, nm, (mx?.m | 0) + 1).run();
              ok = 'Tag ' + nm + ' added.';
            }
          }
        } else if (p.form_type === 'tag_del') {
          const nm = String(p.name || '').trim().toUpperCase().slice(0, 20);
          await db.prepare('DELETE FROM mod_tags WHERE panel_code=? AND UPPER(name)=UPPER(?)').bind(myPanel, nm).run();
          await db.prepare("UPDATE mod_versions SET tag='' WHERE panel_code=? AND UPPER(tag)=UPPER(?)").bind(myPanel, nm).run();
          ok = 'Tag ' + nm + ' removed (versions se bhi hat gaya).';
        }
      }
      const versions = await db.prepare('SELECT id,name,tag,url FROM mod_versions WHERE panel_code=? ORDER BY sort ASC, id ASC').bind(myPanel).all().then(r => r.results || []).catch(() => []);
      const ver = await db.prepare('SELECT version FROM loader_config WHERE panel_code=?').bind(myPanel).first().catch(() => null);
      const tags = await db.prepare('SELECT name FROM mod_tags WHERE panel_code=? ORDER BY sort ASC, name ASC').bind(myPanel).all().then(r => (r.results || []).map(x => x.name)).catch(() => []);
      return P('loader-manager', 'Set Mod/Loader', loaderPage({ ok, error, version: ver?.version || '1.0', versions, tags }));
    }

    // ---------- CREATE PANEL ----------
    if (path === '/create-panel') {
      if (myId !== 1 && !isProfessor(sess)) return deny();
      let ok = '', error = '';
      if (method === 'POST') {
        const p = await formParams(request);
        if (p.action === 'create') {
          let code = String(p.custom_code || '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 15);
          if (!code) { const rb = new Uint8Array(3); crypto.getRandomValues(rb); code = 'PNL' + [...rb].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(); }
          const dur = Math.max(1, parseInt(p.duration, 10) || 30);
          const lim = Math.max(0, Math.min(100000, parseInt(p.account_limit, 10) || 0));
          if (await db.prepare('SELECT panel_code FROM panels WHERE panel_code=?').bind(code).first().catch(() => null)) error = 'Panel code exists.';
          else {
            const exp = new Date(Date.now() + dur * 864e5).toISOString().slice(0, 19).replace('T', ' ');
            await db.prepare('INSERT INTO panels (panel_code,duration,expires_at,is_active,account_limit) VALUES (?,?,?,1,?)').bind(code, dur, exp, lim).run();
            ok = 'Panel ' + code + ' created (acct limit: ' + (lim === 0 ? 'unlimited' : lim) + ').';
          }
        } else if (p.action === 'toggle_status' && p.target_panel) {
          if (String(p.target_panel) === 'YUVI_001' && mainPanel === 'YUVI_001') error = 'Main panel protected.';
          else { await db.prepare('UPDATE panels SET is_active=1-is_active WHERE panel_code=?').bind(String(p.target_panel)).run(); ok = 'Status toggled.'; }
        } else if (p.action === 'set_limit' && p.target_panel) {
          const lim = Math.max(0, Math.min(100000, parseInt(p.account_limit, 10) || 0));
          await db.prepare('UPDATE panels SET account_limit=? WHERE panel_code=?').bind(lim, String(p.target_panel)).run();
          ok = String(p.target_panel) + ' account limit: ' + (lim === 0 ? 'unlimited' : lim) + '.';
        } else if (p.action === 'auto_join' && p.target_panel) {
          const t = String(p.target_panel);
          const cur = await db.prepare('SELECT auto_join FROM panels WHERE panel_code=?').bind(t).first().catch(() => null);
          if (cur && (cur.auto_join | 0) === 1) { await db.prepare('UPDATE panels SET auto_join=0').run(); ok = 'Auto-join OFF.'; }
          else { await db.prepare('UPDATE panels SET auto_join=CASE WHEN panel_code=? THEN 1 ELSE 0 END').bind(t).run(); ok = 'Auto-join ON: ' + t + ' (join page default).'; }
        } else if (p.action === 'delete_panel' && p.target_panel) {
          const t = String(p.target_panel);
          if (t === myPanel) error = 'Own panel delete nahi.';
          else {
            await db.prepare('DELETE FROM key_devices WHERE panel_code=?').bind(t).run().catch(() => {});
            await db.prepare('DELETE FROM api_keys WHERE panel_code=?').bind(t).run().catch(() => {});
            await db.prepare('DELETE FROM users WHERE panel_code=?').bind(t).run().catch(() => {});
            await db.prepare('DELETE FROM panels WHERE panel_code=?').bind(t).run();
            ok = 'Panel ' + t + ' deleted.';
          }
        }
      }
      const list = (await db.prepare('SELECT p.*,(SELECT COUNT(*) FROM users WHERE panel_code=p.panel_code) total_users,(SELECT COUNT(*) FROM api_keys WHERE panel_code=p.panel_code) total_keys FROM panels p ORDER BY p.panel_code').all().catch(() => ({ results: [] }))).results || [];
      return P('create-panel', 'New Tenant', createPanelPage(list, { ok, error }));
    }

    // ---------- SDK (main-owner only, same as PHP) ----------
    const sdkGate = () => (myId === 1 || isProfessor(sess) ? null : redir('/dashboard'));
    if (path === '/sdk') {
      const g = sdkGate(); if (g) return g;
      const q = async (sql, ...b) => (await db.prepare(sql).bind(...b).first().catch(() => ({})));
      const mP = myPanel;
      const d = {
        mTotal: (await q('SELECT COUNT(*) c FROM mundo_keys WHERE panel_code=?', mP)).c || 0,
        mActive: (await q('SELECT COUNT(*) c FROM mundo_keys WHERE panel_code=? AND is_blocked=0', mP)).c || 0,
        mBlocked: (await q('SELECT COUNT(*) c FROM mundo_keys WHERE panel_code=? AND is_blocked=1', mP)).c || 0,
        mPkgs: (await q('SELECT COUNT(*) c FROM mundo_key_bindings b JOIN mundo_keys k ON b.sdk_key_id=k.id WHERE k.panel_code=?', mP)).c || 0,
        bTotal: (await q('SELECT COUNT(*) c FROM bcore_keys WHERE panel_code=?', mP)).c || 0,
        bActive: (await q('SELECT COUNT(*) c FROM bcore_keys WHERE panel_code=? AND is_blocked=0', mP)).c || 0,
        bBlocked: (await q('SELECT COUNT(*) c FROM bcore_keys WHERE panel_code=? AND is_blocked=1', mP)).c || 0,
        bPkgs: (await q('SELECT COUNT(*) c FROM bcore_key_bindings b JOIN bcore_keys k ON b.sdk_key_id=k.id WHERE k.panel_code=?', mP)).c || 0,
        recentM: (await db.prepare('SELECT * FROM mundo_keys WHERE panel_code=? ORDER BY id DESC LIMIT 5').bind(mP).all().catch(() => ({ results: [] }))).results || [],
        recentB: (await db.prepare('SELECT * FROM bcore_keys WHERE panel_code=? ORDER BY id DESC LIMIT 5').bind(mP).all().catch(() => ({ results: [] }))).results || [],
      };
      return S('sdk', 'SDK Dashboard', dashboardPage(d));
    }
    if (path === '/sdk/generate') {
      const g = sdkGate(); if (g) return g;
      let success = '', error = '';
      if (method === 'POST') {
        const p = await formParams(request);
        const engine = p.engine === 'BCORE' ? 'BCORE' : 'MUNDO';
        let ck = String(p.sdk_key || '').trim();
        const dur = parseInt(p.duration, 10), pkg = Math.max(1, parseInt(p.pkg_limit, 10) || 1), app = Math.max(1, parseInt(p.app_limit, 10) || 1);
        const f1 = p.feature1 != null ? 1 : 0, f2 = p.feature2 != null ? 1 : 0;
        const table = engine === 'BCORE' ? 'bcore_keys' : 'mundo_keys';
        if (ck !== '' && ck.length < 5) error = 'Custom key must be at least 5 characters.';
        else if (![7, 15, 30, 60].includes(dur)) error = 'Invalid duration.';
        else if (pkg > 10 || app > 20) error = 'Limits too high.';
        else {
          if (!ck) ck = randomHexKey();
          if (await db.prepare('SELECT id FROM ' + table + ' WHERE sdk_key=?').bind(ck).first().catch(() => null)) error = 'This SDK key already exists in ' + engine + '.';
          else {
            try { await db.prepare('INSERT INTO ' + table + ' (panel_code,sdk_key,duration_days,pkg_limit,app_limit,feature1,feature2,created_by) VALUES (?,?,?,?,?,?,?,?)').bind(myPanel, ck, dur, pkg, app, f1, f2, myId).run(); return redir('/sdk/generate?ok=1&e=' + encodeURIComponent(engine) + '&k=' + encodeURIComponent(ck)); }
            catch (e) { error = 'Database error.'; }
          }
        }
      } else if (url.searchParams.get('ok') === '1' && url.searchParams.get('k')) success = 'SDK Key Generated! Engine: ' + url.searchParams.get('e') + ' | Key: ' + url.searchParams.get('k');
      return S('sdk/generate', 'Generate SDK', generatePage({ success, error }));
    }
    if (path === '/sdk/keys') {
      const g = sdkGate(); if (g) return g;
      if (method === 'POST') {
        const p = await formParams(request);
        const engine = p.engine === 'BCORE' ? 'BCORE' : 'MUNDO';
        const kt = engine === 'BCORE' ? 'bcore_keys' : 'mundo_keys', bt = engine === 'BCORE' ? 'bcore_key_bindings' : 'mundo_key_bindings';
        const kid = parseInt(p.key_id, 10) || 0, bid = parseInt(p.bind_id, 10) || 0;
        const own = kid ? await db.prepare('SELECT id,pkg_limit,app_limit FROM ' + kt + ' WHERE id=? AND panel_code=?').bind(kid, myPanel).first().catch(() => null) : null;
        if (own) {
          const a = p.action;
          if (a === 'block_key') await db.prepare('UPDATE ' + kt + ' SET is_blocked=1 WHERE id=?').bind(kid).run();
          else if (a === 'unblock_key') await db.prepare('UPDATE ' + kt + ' SET is_blocked=0 WHERE id=?').bind(kid).run();
          else if (a === 'delete_key') await db.prepare('DELETE FROM ' + kt + ' WHERE id=?').bind(kid).run();
          else if (a === 'block_bind' && bid) await db.prepare('UPDATE ' + bt + ' SET is_blocked=1 WHERE id=? AND sdk_key_id=?').bind(bid, kid).run();
          else if (a === 'unblock_bind' && bid) await db.prepare('UPDATE ' + bt + ' SET is_blocked=0 WHERE id=? AND sdk_key_id=?').bind(bid, kid).run();
          else if (a === 'delete_bind' && bid) await db.prepare('DELETE FROM ' + bt + ' WHERE id=? AND sdk_key_id=?').bind(bid, kid).run();
          else if (a === 'save_bind' && bid) {
            const pn2 = String(p.pkg_name || '').trim(), an = String(p.app_name || '').trim();
            if (pn2 && an) await db.prepare('UPDATE ' + bt + ' SET pkg_name=?,app_name=? WHERE id=? AND sdk_key_id=?').bind(pn2, an, bid, kid).run();
          } else if (a === 'add_bind') {
            const pn2 = String(p.pkg_name || '').trim(), an = String(p.app_name || '').trim();
            if (pn2 && an) {
              const c = await db.prepare('SELECT COUNT(*) c FROM ' + bt + ' WHERE sdk_key_id=?').bind(kid).first().catch(() => ({ c: 99 }));
              if ((c?.c || 0) < own.pkg_limit * own.app_limit) await db.prepare('INSERT INTO ' + bt + ' (sdk_key_id,pkg_name,app_name) VALUES (?,?,?)').bind(kid, pn2, an).run();
            }
          }
        }
        return redir('/sdk/keys');
      }
      const fk = async (kt, bt) => {
        const r = await db.prepare('SELECT * FROM ' + kt + ' WHERE panel_code=? ORDER BY id DESC').bind(myPanel).all().catch(() => ({ results: [] }));
        const ks = r.results || [];
        for (const k of ks) k.bindings = (await db.prepare('SELECT * FROM ' + bt + ' WHERE sdk_key_id=? ORDER BY id DESC').bind(k.id).all().catch(() => ({ results: [] }))).results || [];
        return ks;
      };
      return S('sdk/keys', 'SDK Keys', keysPage(await fk('mundo_keys', 'mundo_key_bindings'), await fk('bcore_keys', 'bcore_key_bindings')));
    }
    if (path === '/sdk/server') {
      const g = sdkGate(); if (g) return g;
      if (method === 'POST') {
        const p = await formParams(request);
        if (p.toggle_maintenance) {
          const e = p.engine === 'BCORE' ? 'BCORE' : 'MUNDO';
          await db.prepare('INSERT INTO sdk_server_status (panel_code,engine,maintenance_mode,maintenance_message) VALUES (?,?,?,?) ON CONFLICT(panel_code,engine) DO UPDATE SET maintenance_mode=excluded.maintenance_mode,maintenance_message=excluded.maintenance_message').bind(myPanel, e, String(p.maintenance_mode) === '1' ? 1 : 0, String(p.maintenance_message || '').slice(0, 255)).run();
          return redir('/sdk/server?toggled=' + e.toLowerCase());
        }
      }
      const rows = (await db.prepare('SELECT engine,maintenance_mode,maintenance_message FROM sdk_server_status WHERE panel_code=?').bind(myPanel).all().catch(() => ({ results: [] }))).results || [];
      let mM = 0, mS = '', bM = 0, bS = '';
      for (const r of rows) { if (r.engine === 'MUNDO') { mM = r.maintenance_mode | 0; mS = r.maintenance_message || ''; } if (r.engine === 'BCORE') { bM = r.maintenance_mode | 0; bS = r.maintenance_message || ''; } }
      return S('sdk/server', 'SDK Server', sdkServerPage({ mMaint: mM, mMsg: mS, bMaint: bM, bMsg: bS, host: url.host, panel: myPanel, toggled: url.searchParams.get('toggled') || '' }));
    }
    if (path === '/sdk/hash') {
      const g = sdkGate(); if (g) return g;
      if (method === 'POST') {
        const p = await formParams(request);
        const e = p.engine === 'BCORE' ? 'BCORE' : 'MUNDO';
        if (p.action === 'add_hash') {
          const lb = String(p.hash_label || '').trim().slice(0, 100), vl = String(p.hash_value || '').trim().toLowerCase();
          if (lb && /^[a-f0-9]{64}$/.test(vl)) await db.prepare('INSERT INTO sdk_hash_vault (panel_code,engine,hash_type,hash_label,hash_value) VALUES (?,?,?,?,?)').bind(myPanel, e, 'lib_signature', lb, vl).run();
        } else if (p.action === 'delete_hash') await db.prepare('DELETE FROM sdk_hash_vault WHERE id=? AND panel_code=?').bind(parseInt(p.hash_id, 10) || 0, myPanel).run();
        else if (p.action === 'toggle_hash') await db.prepare('UPDATE sdk_hash_vault SET is_active=1-is_active WHERE id=? AND panel_code=?').bind(parseInt(p.hash_id, 10) || 0, myPanel).run();
        return redir('/sdk/hash');
      }
      const mH = (await db.prepare('SELECT * FROM sdk_hash_vault WHERE panel_code=? AND engine=? ORDER BY id DESC').bind(myPanel, 'MUNDO').all().catch(() => ({ results: [] }))).results || [];
      const bH = (await db.prepare('SELECT * FROM sdk_hash_vault WHERE panel_code=? AND engine=? ORDER BY id DESC').bind(myPanel, 'BCORE').all().catch(() => ({ results: [] }))).results || [];
      return S('sdk/hash', 'SDK Hash', sdkHashPage({ mHashes: mH, bHashes: bH, mActive: mH.find(h => h.is_active) || null, bActive: bH.find(h => h.is_active) || null, salt: mundoSaltFromEnv(env), aesHex: mundoAesKeyHex(mundoSaltFromEnv(env)) }));
    }

    // ---------- OPENCODE APP ----------
    // The standalone control plane is handled before the SDK session gate
    // above (/opencode, /opencode/users, /opencode/notices, /opencode/settings).

    return new Response('404 - Page Not Found', { status: 404 });
  }
};

