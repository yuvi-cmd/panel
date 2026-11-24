import { emptyState, icon, pageHeader, sectionHead, segmented, statusBadge, timeCell } from '../ui.js';
import { esc, truncate } from '../http.js';

function csrfInput(csrf) { return `<input type="hidden" name="_csrf" value="${esc(csrf)}">`; }

export function hostsPage({ hosts = [], counts = {}, q = '', status = 'ALL', csrf, server }) {
  const returnTo = '/hosts' + (q || status !== 'ALL'
    ? '?' + new URLSearchParams({ ...(q ? { q } : {}), ...(status !== 'ALL' ? { status } : {}) }).toString()
    : '');
  const rows = hosts.length ? hosts.map((h) => {
    const active = String(h.status).toUpperCase() === 'ACTIVE';
    return `
    <tr>
      <td data-label="Host">
        <a class="cell-main link" href="/licenses/${h.license_id}">${esc(h.label || h.license_uid)}</a>
        <div class="cell-sub mono">${esc(h.license_uid)}</div>
      </td>
      <td data-label="Package"><span class="mono">${esc(h.package_name)}</span>${h.app_name ? `<div class="cell-sub">${esc(h.app_name)}</div>` : ''}</td>
      <td data-label="Certificate"><span class="mono small" title="${esc(h.cert_sha256)}">${esc(truncate(h.cert_sha256, 24))}</span></td>
      <td data-label="Mode"><span class="chip acc">${h.version_policy === 'ANY' ? 'CERT + PKG' : esc(h.version_policy)}</span></td>
      <td data-label="Last seen">${timeCell(h.last_seen)}</td>
      <td data-label="Status">${statusBadge(h.status)}</td>
      <td data-label="" class="actions">
        <form method="post" action="/hosts/action" style="display:inline">
          ${csrfInput(csrf)}<input type="hidden" name="license_id" value="${h.license_id}">
          <input type="hidden" name="host_id" value="${h.id}">
          <input type="hidden" name="return" value="${esc(returnTo)}">
          <input type="hidden" name="action" value="${active ? 'suspend' : 'activate'}">
          <button class="btn btn-sm ${active ? 'btn-danger' : 'btn-primary'}" type="submit"
            onclick="return askConfirm(this.form,'${active ? 'Suspend' : 'Reactivate'} this host package?','${active ? 'Active grants and tickets are revoked and this package is denied until reactivated. Its package slot stays reserved.' : 'The stored package + certificate will be accepted again.'}','${active ? 'danger' : ''}')">
            ${icon(active ? 'ban' : 'check', 13)} ${active ? 'Suspend' : 'Activate'}
          </button>
        </form>
        <form method="post" action="/hosts/action" style="display:inline">
          ${csrfInput(csrf)}<input type="hidden" name="license_id" value="${h.license_id}">
          <input type="hidden" name="host_id" value="${h.id}">
          <input type="hidden" name="return" value="${esc(returnTo)}">
          <input type="hidden" name="action" value="delete">
          <button class="btn btn-sm btn-danger" type="submit"
            onclick="return askConfirm(this.form,'Delete this host package?','The package + certificate pin, its sessions, grants and host-scoped guest bindings are removed. The package slot becomes free. This cannot be undone.','danger')">
            ${icon('trash', 13)} Delete
          </button>
        </form>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="7">${emptyState('server', 'No host bindings', q || status !== 'ALL' ? 'No host matches this filter.' : 'A host binds automatically on its first successful authorization, or pre-register it from a license.')}</td></tr>`;

  return `
    ${pageHeader({
      eyebrow: 'Host identity',
      title: 'Host packages',
      subtitle: 'Every host APK package under a license is pinned by package name, app name and signing certificate, up to the license package limit.',
      actions: `<a class="btn" href="/licenses">${icon('key', 16)} Licenses</a><a class="btn btn-primary" href="/licenses/new">${icon('plus', 16)} Issue MAK</a>`,
    })}
    ${!server.enabled ? `<div class="notice">${icon('alert', 17)}<div><b>Activation server is OFF.</b> Host authentication is denied until it is switched on.</div></div>` : ''}
    <div class="toolbar">
      <form class="search" method="get" action="/hosts">
        <input type="hidden" name="status" value="${esc(status)}">
        ${icon('search', 16)}
        <input name="q" value="${esc(q)}" placeholder="Search package, license ID or label…" autocomplete="off">
      </form>
      ${segmented('/hosts', status, [
        { value: 'ALL', label: 'All', count: counts.total },
        { value: 'ACTIVE', label: 'Active', count: counts.active },
        { value: 'SUSPENDED', label: 'Suspended', count: counts.suspended },
      ])}
    </div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>License</th><th>Package</th><th>Certificate</th><th>Match</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="table-foot"><span>${hosts.length} shown · ${counts.active || 0} active</span><span>First-use pinning is proof-gated</span></div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        ${sectionHead('Binding rules')}
        <div class="timeline">
          <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-main"><b>AUTO mode</b><p>The first valid MAK + four-field host identity (package, app name, certificate) binds each new package, up to Max host packages.</p></div></div>
          <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-main"><b>MANUAL mode</b><p>Only host packages pre-registered by an administrator can authenticate.</p></div></div>
          <div class="timeline-item"><span class="timeline-dot bad"></span><div class="timeline-main"><b>Mismatch is fatal</b><p>Any package or certificate difference returns HOST_PACKAGE_MISMATCH / HOST_CERT_MISMATCH.</p></div></div>
        </div>
      </div>
      <div class="card">
        ${sectionHead('Delete guidance')}
        <p class="muted small" style="margin:0 0 10px">Delete a package when you want to free its package slot, or when the host moved to a different package name. Suspending keeps the slot reserved.</p>
        <div class="notice" style="margin:0">${icon('shield-alert', 17)}<div>Deletion removes the package pin, its grants, sessions and host-scoped guest bindings. Security events are retained for audit.</div></div>
      </div>
    </div>`;
}
