import { emptyState, icon, pageHeader, sectionHead, segmented, statusBadge, timeCell } from '../ui.js';
import { esc, fmtDate, fmtDateTime, truncate } from '../http.js';

function csrfInput(csrf) { return `<input type="hidden" name="_csrf" value="${esc(csrf)}">`; }

export function devicesPage({ devices = [], counts = {}, q = '', status = 'ALL', csrf, server }) {
  const rows = devices.length ? devices.map((d) => {
    const active = String(d.status).toUpperCase() === 'ACTIVE';
    return `
    <tr>
      <td data-label="Device">
        <div class="cell-main mono">${esc(d.fingerprint)}</div>
        <div class="cell-sub mono">${esc(d.device_uid)}</div>
      </td>
      <td data-label="License">
        <a class="link" href="/licenses/${d.license_id}">${esc(d.label || d.license_uid)}</a>
        <div class="cell-sub mono">${esc(d.license_uid)}</div>
      </td>
      <td data-label="Algorithm"><span class="chip">${esc(d.key_algorithm || 'ECDSA-P256')}</span></td>
      <td data-label="Registered" title="${esc(fmtDateTime(d.registered_at))}">${esc(fmtDate(d.registered_at))}</td>
      <td data-label="Last seen">${timeCell(d.last_seen)}</td>
      <td data-label="Status">${statusBadge(d.status)}</td>
      <td data-label="" class="actions">
        ${active ? `<form method="post" action="/devices/action" style="display:inline">
          ${csrfInput(csrf)}<input type="hidden" name="device_id" value="${d.id}"><input type="hidden" name="action" value="revoke">
          <button class="btn btn-sm btn-danger" type="submit" onclick="return askConfirm(this.form,'Revoke this device?','Every session for the device is revoked. The key stays registered but cannot be used.','danger')">${icon('ban', 13)} Revoke</button>
        </form>` : `<form method="post" action="/devices/action" style="display:inline">
          ${csrfInput(csrf)}<input type="hidden" name="device_id" value="${d.id}"><input type="hidden" name="action" value="delete">
          <button class="btn btn-sm btn-ghost" type="submit" onclick="return askConfirm(this.form,'Delete this device record?','The row is removed. Audit events remain. A reinstall can register a new key.','danger')">${icon('trash', 13)} Delete</button>
        </form>`}
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="7">${emptyState('smartphone', 'No devices', q || status !== 'ALL' ? 'No device matches this filter.' : 'MAK/2 does not collect a device_id. Hosts are bound by package name + certificate fingerprint on first successful /mak/v2/activate.')}</td></tr>`;

  return `
    ${pageHeader({
      eyebrow: 'Device trust',
      title: 'Bound devices',
      subtitle: 'Private keys never leave Android Keystore. Only P-256 public keys are stored.',
      actions: `<a class="btn" href="/licenses">${icon('key', 16)} Licenses</a><a class="btn" href="/sessions">${icon('radio', 16)} Sessions</a>`,
    })}
    ${!server.enabled ? `<div class="notice">${icon('alert', 17)}<div><b>Activation server is OFF.</b> All device proofs are denied until it is switched on.</div></div>` : ''}
    <div class="toolbar">
      <form class="search" method="get" action="/devices">
        <input type="hidden" name="status" value="${esc(status)}">
        ${icon('search', 16)}
        <input name="q" value="${esc(q)}" placeholder="Search fingerprint, device UID or license…" autocomplete="off">
      </form>
      ${segmented('/devices', status, [
        { value: 'ALL', label: 'All', count: counts.total },
        { value: 'ACTIVE', label: 'Active', count: counts.active },
        { value: 'REVOKED', label: 'Revoked', count: counts.revoked },
      ])}
    </div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>Device</th><th>License</th><th>Algorithm</th><th>Registered</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="table-foot"><span>${devices.length} shown · ${counts.active || 0} active</span><span>Fingerprint = SHA-256 of SPKI DER</span></div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        ${sectionHead('Device proof')}
        <div class="timeline">
          <div class="timeline-item"><span class="timeline-dot ok"></span><div class="timeline-main"><b>Keystore generated</b><p>The host generates an ECDSA P-256 key inside Android Keystore.</p></div></div>
          <div class="timeline-item"><span class="timeline-dot ok"></span><div class="timeline-main"><b>Public key registered</b><p>The server stores the SPKI public key and a SHA-256 fingerprint.</p></div></div>
          <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-main"><b>Every sensitive call signed</b><p>Authorize, guest check, renew and heartbeat carry a fresh proof.</p></div></div>
        </div>
      </div>
      <div class="card">
        ${sectionHead('Revocation')}
        <p class="muted small" style="margin:0 0 10px">Revoke a device when it is lost, replaced, or shows tamper behavior. The license's activation counter is not refunded automatically; delete the row only if you intend to allow a fresh registration.</p>
        <div class="notice" style="margin:0">${icon('shield', 17)}<div>Server decisions fail closed. There is no offline grace path that bypasses revocation.</div></div>
      </div>
    </div>`;
}
