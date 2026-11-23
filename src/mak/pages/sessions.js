import { emptyState, icon, pageHeader, sectionHead, segmented, statusBadge, timeCell } from '../ui.js';
import { esc, fmtDateTime, truncate } from '../http.js';

function csrfInput(csrf) { return `<input type="hidden" name="_csrf" value="${esc(csrf)}">`; }

function effectiveSessionStatus(s) {
  if (String(s.status).toUpperCase() === 'REVOKED') return 'REVOKED';
  if (Number(s.expires_at) <= Math.floor(Date.now() / 1000)) return 'EXPIRED';
  return 'ACTIVE';
}

export function sessionsPage({ sessions = [], counts = {}, q = '', status = 'ALL', csrf, server }) {
  const now = Math.floor(Date.now() / 1000);
  const rows = sessions.length ? sessions.map((s) => {
    const effective = effectiveSessionStatus(s);
    const active = effective === 'ACTIVE';
    const pct = Math.max(0, Math.min(100, Math.round(((Number(s.expires_at) - now) / Math.max(60, Number(s.expires_at) - Number(s.issued_at))) * 100)));
    return `
    <tr>
      <td data-label="Session">
        <div class="cell-main mono">${esc(truncate(s.id, 30))}</div>
        <div class="cell-sub">${s.request_id ? esc(truncate(s.request_id, 34)) : 'No request id'}</div>
      </td>
      <td data-label="License">
        <a class="link" href="/licenses/${s.license_id}">${esc(s.label || s.license_uid)}</a>
        <div class="cell-sub mono">${esc(s.license_uid)}</div>
      </td>
      <td data-label="Device"><span class="mono small" title="${esc(s.fingerprint || '')}">${esc(truncate(s.fingerprint || '—', 22))}</span><div class="cell-sub">${esc(s.host_package || 'Host not bound')}</div></td>
      <td data-label="Issued">${timeCell(s.issued_at)}</td>
      <td data-label="Expires"><span title="${esc(fmtDateTime(s.expires_at))}">${esc(fmtDateTime(s.expires_at))}</span><div class="meter" style="margin-top:5px;max-width:90px"><span style="width:${pct}%"></span></div></td>
      <td data-label="Heartbeat">${timeCell(s.last_heartbeat)}</td>
      <td data-label="Status">${statusBadge(effective)}</td>
      <td data-label="" class="actions">
        <form method="post" action="/sessions/action" style="display:inline">
          ${csrfInput(csrf)}<input type="hidden" name="session_id" value="${esc(s.id)}"><input type="hidden" name="action" value="revoke">
          <button class="btn btn-sm btn-danger" type="submit" ${active ? '' : 'disabled'} onclick="return askConfirm(this.form,'Revoke this session?','The next request from the host is denied until it authorizes again.','danger')">${icon('ban', 13)} Revoke</button>
        </form>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="8">${emptyState('radio', 'No sessions', q || status !== 'ALL' ? 'No session matches this filter.' : 'Sessions are created after a host and device are authorized.')}</td></tr>`;

  return `
    ${pageHeader({
      eyebrow: 'Session state',
      title: 'Authorization sessions',
      subtitle: 'Short-lived state. Every guest operation is re-checked on the server.',
      actions: `<a class="btn" href="/devices">${icon('smartphone', 16)} Devices</a>
        <form method="post" action="/sessions/action" style="display:inline">
          ${csrfInput(csrf)}<input type="hidden" name="action" value="revoke_all">
          <button class="btn btn-danger" type="submit" onclick="return askConfirm(this.form,'Revoke every session?','All hosts must authorize again. Licenses, devices and host bindings are unchanged.','danger')">${icon('ban', 15)} Revoke all</button>
        </form>`,
    })}
    ${!server.enabled ? `<div class="notice">${icon('alert', 17)}<div><b>Activation server is OFF.</b> Renew, heartbeat and guest checks are denied; session rows will expire naturally.</div></div>` : ''}
    <div class="toolbar">
      <form class="search" method="get" action="/sessions">
        <input type="hidden" name="status" value="${esc(status)}">
        ${icon('search', 16)}
        <input name="q" value="${esc(q)}" placeholder="Search session, license or host package…" autocomplete="off">
      </form>
      ${segmented('/sessions', status, [
        { value: 'ALL', label: 'All', count: counts.total },
        { value: 'ACTIVE', label: 'Active', count: counts.active },
        { value: 'EXPIRED', label: 'Expired', count: counts.expired },
        { value: 'REVOKED', label: 'Revoked', count: counts.revoked },
      ])}
    </div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>Session</th><th>License</th><th>Device / host</th><th>Issued</th><th>Expires</th><th>Heartbeat</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="table-foot"><span>${sessions.length} shown · ${counts.active || 0} active</span><span>Client clock is never trusted</span></div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        ${sectionHead('Why short-lived?')}
        <p class="muted small" style="margin:0">A signed session does not replace live checks. Every guest install, launch, update or restart calls /mak/v1/guest/check and receives a fresh signed decision. Revocation applies immediately.</p>
      </div>
      <div class="card">
        ${sectionHead('Heartbeat')}
        <p class="muted small" style="margin:0">Hosts send signed heartbeats at the configured interval. Repeated proof failures or missing heartbeats are visible in Security logs and can justify manual revocation.</p>
      </div>
    </div>`;
}
