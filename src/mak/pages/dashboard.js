import {
  icon, pageHeader, resultBadge, sectionHead, statusBadge, timeCell,
} from '../ui.js';
import { esc, fmtDate, relTime, truncate } from '../http.js';

export function dashboardPage({
  admin, csrf, server, signingReady, signingReason, announcement = '',
  stats, recent = [], expiring = [], counts = {},
}) {
  const on = !!server.enabled;
  const recentRows = recent.length ? recent.map((e) => `
    <tr>
      <td data-label="Event"><div class="cell-main">${esc(String(e.event_type || '').replace(/_/g, ' '))}</div><div class="cell-sub">${esc(e.detail || e.error_code || '—')}</div></td>
      <td data-label="License">${e.license_label ? `<a class="link" href="/licenses/${e.license_id}">${esc(truncate(e.license_label, 22))}</a>` : '<span class="muted">—</span>'}</td>
      <td data-label="Result">${resultBadge(e.result)}</td>
      <td data-label="Time" class="nowrap">${timeCell(e.created_at)}</td>
    </tr>`).join('') : `<tr><td colspan="4" class="table-empty">No security events yet.</td></tr>`;

  const expiringRows = expiring.length ? expiring.map((l) => `
    <a class="quick" href="/licenses/${l.id}">
      <span class="qic">${icon('clock', 16)}</span>
      <span class="grow"><b>${esc(l.label || l.license_uid)}</b><small>Expires ${esc(fmtDate(l.expires_at))} · ${esc(relTime(l.expires_at))}</small></span>
      ${icon('chevron-right', 15)}
    </a>`).join('') : `<div class="empty" style="padding:24px 10px"><div class="empty-ic">${icon('clock', 22)}</div><h3>Nothing expiring</h3><p>No active license expires in the next 7 days.</p></div>`;

  const hero = `
  <section class="hero fade-up">
    <div class="hero-grid">
      <div>
        <span class="hero-kicker">${icon('radio', 12)} Server-authoritative control</span>
        <h2>${on ? 'Activation server is <span class="grad">online</span>.' : 'Activation server is <span class="grad">offline</span>.'}</h2>
        <p>${on
          ? 'Hosts can request signed authorizations. Every guest install, launch, update and restart is checked against its license, device and APK identity.'
          : 'All MAK/1 endpoints are failing closed right now. Existing sessions are denied immediately until the server is switched back on.'}</p>
        <div class="hero-meta">
          <div>Protocol<b>MAK/1</b></div>
          <div>Signing<b>${signingReady ? 'Ed25519 active' : 'Not configured'}</b></div>
          <div>Key ID<b>${signingReady ? esc(server.keyId || 'active') : '—'}</b></div>
          <div>Edge<b>Cloudflare + D1</b></div>
        </div>
      </div>
      <div class="server-control">
        <div class="sc-top"><span class="sc-label">Global switch</span>${statusBadge(on ? 'ONLINE' : 'OFFLINE')}</div>
        <div class="sc-state ${on ? 'on' : 'off'}">${on ? 'ON' : 'OFF'}</div>
        <div class="sc-note">${on ? 'Signed decisions are being served.' : 'All activation requests are denied.'}</div>
        <form method="post" action="/settings/server">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <input type="hidden" name="action" value="toggle">
          <button class="btn ${on ? 'btn-danger' : 'btn-primary'}" type="submit"
            ${on ? `onclick="return askConfirm(this.form,'Turn activation server OFF?','Every host will be denied at its next request. Existing sessions also stop authorizing guest operations.','danger')"` : ''}>
            ${icon(on ? 'ban' : 'zap', 16)} ${on ? 'Stop server' : 'Start server'}
          </button>
        </form>
      </div>
    </div>
  </section>`;

  const keyBanner = signingReady ? '' : `
    <div class="alert alert-bad">
      <span class="alert-ic">${icon('shield-alert', 18)}</span>
      <div class="alert-body"><b>Signing key is not configured.</b> ${esc(signingReason || 'Set MAK_SIGNING_KEY before enabling activation.')} <a class="link" href="/settings">Open settings</a>.</div>
    </div>`;

  const kpis = `
  <div class="grid-4" style="margin-bottom:18px">
    <div class="kpi fade-up"><div class="kpi-top"><span class="kpi-ic">${icon('key', 18)}</span><span class="badge ok">${counts.active || 0} active</span></div><div class="kpi-label">Licenses</div><div class="kpi-value">${stats.active || 0}</div><div class="kpi-foot">${stats.total || 0} total · ${counts.expired || 0} expired</div></div>
    <div class="kpi fade-up"><div class="kpi-top"><span class="kpi-ic cyan">${icon('smartphone', 18)}</span><span class="badge info">${stats.devices_online || 0} live</span></div><div class="kpi-label">Bound devices</div><div class="kpi-value">${stats.devices || 0}</div><div class="kpi-foot">P-256 public keys registered</div></div>
    <div class="kpi fade-up"><div class="kpi-top"><span class="kpi-ic green">${icon('apps', 18)}</span><span class="badge ok">${stats.guests || 0} approved</span></div><div class="kpi-label">Guest apps</div><div class="kpi-value">${stats.guests || 0}</div><div class="kpi-foot">APK hash + signer verified</div></div>
    <div class="kpi fade-up"><div class="kpi-top"><span class="kpi-ic amber">${icon('radio', 18)}</span><span class="badge info">${stats.sessions || 0} open</span></div><div class="kpi-label">Live sessions</div><div class="kpi-value">${stats.sessions || 0}</div><div class="kpi-foot">${stats.activations || 0} lifetime activations</div></div>
  </div>`;

  const content = `
    ${pageHeader({
      eyebrow: 'Overview',
      title: 'Activation overview',
      subtitle: 'One credential per host. Signed authorization for every guest operation.',
      actions: `<a class="btn" href="/logs">${icon('activity', 16)} Security logs</a><a class="btn btn-primary" href="/licenses/new">${icon('plus', 16)} Issue MAK</a>`,
    })}
    ${announcement ? `<div class="notice">${icon('zap', 17)}<div>${esc(announcement)}</div></div>` : ''}
    ${keyBanner}
    ${hero}
    ${kpis}
    <div class="detail-grid">
      <div class="stack">
        <div class="card tight">
          ${sectionHead('Recent security activity', 'Signed allow / deny decisions from hosts and devices.', `<a class="btn btn-sm btn-ghost" href="/logs">View all ${icon('arrow-right', 14)}</a>`)}
          <div class="table-wrap" style="border:0;border-radius:0;background:transparent">
            <table class="tbl"><thead><tr><th>Event</th><th>License</th><th>Result</th><th>Time</th></tr></thead><tbody>${recentRows}</tbody></table>
          </div>
        </div>
        <div class="card tight">
          ${sectionHead('Protocol endpoints', 'Base URL: this Worker origin + /mak/v1', `<a class="btn btn-sm btn-ghost" href="/mak/v1/status" target="_blank" rel="noopener">${icon('external', 14)} Status JSON</a>`)}
          <div style="padding:4px 18px 16px">
            <div class="endpoint"><span class="method">POST</span><code>/mak/v1/challenge</code><span class="dot-ok">${on ? 'LIVE' : 'CLOSED'}</span></div>
            <div class="endpoint"><span class="method">POST</span><code>/mak/v1/authorize</code><span class="dot-ok">${on ? 'LIVE' : 'CLOSED'}</span></div>
            <div class="endpoint"><span class="method">POST</span><code>/mak/v1/guest/check</code><span class="dot-ok">${on ? 'LIVE' : 'CLOSED'}</span></div>
            <div class="endpoint"><span class="method">POST</span><code>/mak/v1/renew</code><span class="dot-ok">${on ? 'LIVE' : 'CLOSED'}</span></div>
            <div class="endpoint"><span class="method">POST</span><code>/mak/v1/heartbeat</code><span class="dot-ok">${on ? 'LIVE' : 'CLOSED'}</span></div>
          </div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          ${sectionHead('Quick actions', 'Common operator tasks.')}
          <div class="quick-grid">
            <a class="quick" href="/licenses/new"><span class="qic">${icon('plus', 16)}</span><span><b>Issue MAK</b><small>One-time credential reveal</small></span></a>
            <a class="quick" href="/guests/new"><span class="qic">${icon('apps', 16)}</span><span><b>Register guest</b><small>APK hash + signer</small></span></a>
            <a class="quick" href="/hosts"><span class="qic">${icon('server', 16)}</span><span><b>Host bindings</b><small>Package + certificate</small></span></a>
            <a class="quick" href="/devices"><span class="qic">${icon('smartphone', 16)}</span><span><b>Devices</b><small>Revoke or inspect</small></span></a>
          </div>
        </div>
        <div class="card">
          ${sectionHead('Expiring soon', 'Next 7 days.')}
          <div class="stack" style="gap:8px">${expiringRows}</div>
        </div>
        <div class="card">
          ${sectionHead('Posture', 'Fail-closed by design.')}
          <dl class="kv">
            <dt>Server switch</dt><dd>${statusBadge(on ? 'ONLINE' : 'OFFLINE')}</dd>
            <dt>Response signing</dt><dd>${signingReady ? statusBadge('ACTIVE') : statusBadge('SUSPENDED')}</dd>
            <dt>Device proof</dt><dd>${statusBadge('ACTIVE')}</dd>
            <dt>Guest proof</dt><dd>${server.guestProofRequired ? statusBadge('ACTIVE') : statusBadge('SUSPENDED')}</dd>
            <dt>Session TTL</dt><dd>${esc(String(server.sessionTtl || 3600))}s</dd>
            <dt>Heartbeat</dt><dd>${esc(String(server.heartbeatInterval || 300))}s</dd>
          </dl>
        </div>
      </div>
    </div>`;
  return content;
}
