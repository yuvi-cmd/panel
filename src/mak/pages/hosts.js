import { emptyState, icon, pageHeader, sectionHead, segmented, statusBadge, timeCell } from '../ui.js';
import { esc, truncate } from '../http.js';

function csrfInput(csrf) { return `<input type="hidden" name="_csrf" value="${esc(csrf)}">`; }

export function hostsPage({ hosts = [], counts = {}, q = '', status = 'ALL', csrf, server }) {
  const rows = hosts.length ? hosts.map((h) => {
    const active = String(h.status).toUpperCase() === 'ACTIVE';
    return `
    <tr>
      <td data-label="Host">
        <a class="cell-main link" href="/licenses/${h.license_id}">${esc(h.label || h.license_uid)}</a>
        <div class="cell-sub mono">${esc(h.license_uid)}</div>
      </td>
      <td data-label="Package"><span class="mono">${esc(h.package_name)}</span></td>
      <td data-label="Certificate"><span class="mono small" title="${esc(h.cert_sha256)}">${esc(truncate(h.cert_sha256, 24))}</span></td>
      <td data-label="Mode"><span class="chip acc">${h.version_policy === 'ANY' ? 'CERT + PKG' : esc(h.version_policy)}</span></td>
      <td data-label="Last seen">${timeCell(h.last_seen)}</td>
      <td data-label="Status">${statusBadge(h.status)}</td>
      <td data-label="" class="actions">
        <form method="post" action="/hosts/action" style="display:inline">
          ${csrfInput(csrf)}<input type="hidden" name="license_id" value="${h.license_id}">
          <input type="hidden" name="action" value="${active ? 'suspend' : 'activate'}">
          <button class="btn btn-sm ${active ? 'btn-danger' : 'btn-primary'}" type="submit"
            onclick="return askConfirm(this.form,'${active ? 'Suspend' : 'Reactivate'} this host binding?','${active ? 'Active sessions are revoked and the host is denied until reactivated.' : 'The stored package + certificate will be accepted again.'}','${active ? 'danger' : ''}')">
            ${icon(active ? 'ban' : 'check', 13)} ${active ? 'Suspend' : 'Activate'}
          </button>
        </form>
        <form method="post" action="/hosts/action" style="display:inline">
          ${csrfInput(csrf)}<input type="hidden" name="license_id" value="${h.license_id}">
          <input type="hidden" name="action" value="reset">
          <button class="btn btn-sm btn-ghost" type="submit"
            onclick="return askConfirm(this.form,'Reset host binding?','The package + certificate pin is removed and active sessions are revoked. The next authenticated host will bind again.','danger')">
            ${icon('rotate', 13)} Reset
          </button>
        </form>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="7">${emptyState('server', 'No host bindings', q || status !== 'ALL' ? 'No host matches this filter.' : 'A host binds automatically on its first successful authorization, or pre-register it from a license.')}</td></tr>`;

  return `
    ${pageHeader({
      eyebrow: 'Host control',
      title: 'Host bindings',
      subtitle: 'One host APK per license. Package name and signing certificate are both pinned.',
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
          <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-main"><b>First use</b><p>Without a pre-registered host, the first valid MAK + device proof pins package and certificate.</p></div></div>
          <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-main"><b>Strict mode</b><p>The license can require a host that was pre-registered by an administrator.</p></div></div>
          <div class="timeline-item"><span class="timeline-dot bad"></span><div class="timeline-main"><b>Mismatch is fatal</b><p>Any package or certificate difference returns HOST_PACKAGE_MISMATCH / HOST_CERT_MISMATCH.</p></div></div>
        </div>
      </div>
      <div class="card">
        ${sectionHead('Reset guidance')}
        <p class="muted small" style="margin:0 0 10px">Reset the binding when the host is rebuilt with a new signing certificate, or when the pin was created by a bad request.</p>
        <div class="notice" style="margin:0">${icon('shield-alert', 17)}<div>Resetting does not change the MAK. Rotate the credential too if you suspect the key leaked.</div></div>
      </div>
    </div>`;
}
