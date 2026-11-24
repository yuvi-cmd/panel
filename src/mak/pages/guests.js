import { emptyState, field, icon, pageHeader, sectionHead, segmented, statusBadge, timeCell } from '../ui.js';
import { esc, fmtDate, truncate } from '../http.js';

function csrfInput(csrf) { return `<input type="hidden" name="_csrf" value="${esc(csrf)}">`; }

export function guestsPage({ guests = [], counts = {}, q = '', status = 'ALL', csrf }) {
  const rows = guests.length ? guests.map((g) => `
    <tr>
      <td data-label="Guest"><a class="cell-main link" href="/guests/${g.id}">${esc(g.app_name || g.package_name)}</a><div class="cell-sub mono">${esc(g.package_name)} · v${esc(g.version_code)}</div></td>
      <td data-label="APK SHA-256"><span class="mono small">${esc(truncate(g.apk_sha256, 22))}</span></td>
      <td data-label="Signer"><span class="mono small">${esc(truncate(g.cert_sha256, 22))}</span></td>
      <td data-label="Licenses"><span class="chip acc">${g.binding_count || 0} bound</span></td>
      <td data-label="Status">${statusBadge(g.status)}</td>
      <td data-label="" class="actions"><a class="btn btn-sm btn-ghost" href="/guests/${g.id}">Open ${icon('chevron-right', 13)}</a></td>
    </tr>`).join('') : `<tr><td colspan="6">${emptyState('apps', 'No guest apps', q ? 'No guest matches this search.' : 'Register an APK hash and signing certificate before binding it to licenses.', `<a class="btn btn-primary" href="/guests/new">${icon('plus', 15)} Register guest</a>`)}</td></tr>`;

  return `
    ${pageHeader({
      eyebrow: 'Application allow-list',
      title: 'Guest applications',
      subtitle: 'APK identity = package + APK SHA-256 + signing certificate SHA-256.',
      actions: `<a class="btn btn-primary" href="/guests/new">${icon('plus', 16)} Register guest</a>`,
    })}
    <div class="toolbar">
      <form class="search" method="get" action="/guests"><input type="hidden" name="status" value="${esc(status)}">${icon('search', 16)}<input name="q" value="${esc(q)}" placeholder="Search package, app name or APK hash…" autocomplete="off"></form>
      ${segmented('/guests', status, [
        { value: 'ALL', label: 'All', count: counts.total },
        { value: 'ACTIVE', label: 'Active', count: counts.active },
        { value: 'SUSPENDED', label: 'Suspended', count: counts.suspended },
      ])}
    </div>
    <div class="table-wrap">
      <table class="tbl"><thead><tr><th>Guest</th><th>APK SHA-256</th><th>Signer</th><th>Licenses</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div class="table-foot"><span>${guests.length} shown</span><span>Version codes are approved explicitly</span></div>
    </div>`;
}

export function newGuestPage({ csrf, error = '', values = {} }) {
  const v = values || {};
  return `
    ${pageHeader({
      eyebrow: 'Register identity',
      title: 'Register a guest app',
      subtitle: 'A guest is only authorized when package, APK hash, certificate and version all match.',
      actions: `<a class="btn" href="/guests">${icon('chevron-left', 16)} Back</a>`,
    })}
    ${error ? `<div class="alert alert-bad"><span class="alert-ic">${icon('alert', 18)}</span><div class="alert-body">${esc(error)}</div></div>` : ''}
    <div class="detail-grid">
      <form class="card" method="post" action="/guests/new">
        ${csrfInput(csrf)}
        ${sectionHead('Identity', 'All fields are server-side verified.')}
        <div class="form-grid">
          ${field('Package name', `<input name="package_name" value="${esc(v.package_name || '')}" placeholder="com.example.guest" required maxlength="200">`)}
          ${field('App name', `<input name="app_name" value="${esc(v.app_name || '')}" placeholder="Guest Application" maxlength="120">`)}
          ${field('APK SHA-256', `<input name="apk_sha256" value="${esc(v.apk_sha256 || '')}" placeholder="64 hex characters" required maxlength="80">`, 'Exact APK artifact hash, not the signing certificate.')}
          ${field('Signing certificate SHA-256', `<input name="cert_sha256" value="${esc(v.cert_sha256 || '')}" placeholder="64 hex characters" required maxlength="80">`, 'Android signing certificate fingerprint.')}
          ${field('Version code', `<input type="number" name="version_code" min="0" max="2147483647" value="${esc(v.version_code || '1')}" required>`, 'New builds need a new approved version row.')}
        </div>
        <div class="form-actions"><a class="btn" href="/guests">Cancel</a><button class="btn btn-primary" type="submit">${icon('check', 15)} Register guest</button></div>
      </form>
      <div class="stack">
        <div class="card">
          ${sectionHead('Verification rules')}
          <div class="timeline">
            <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-main"><b>Package</b><p>Must match the installed guest package exactly.</p></div></div>
            <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-main"><b>APK hash</b><p>SHA-256 of the exact APK artifact. Any modification changes it.</p></div></div>
            <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-main"><b>Certificate</b><p>Signing identity is public, but must be registered here first.</p></div></div>
            <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-main"><b>Binding</b><p>A guest also needs an active license binding with permissions.</p></div></div>
          </div>
        </div>
        <div class="card">
          ${sectionHead('Warning')}
          <div class="notice" style="margin:0">${icon('shield-alert', 17)}<div>Never approve an APK you did not build or verify. The host trusts the server's signed decision.</div></div>
        </div>
      </div>
    </div>`;
}

export function guestDetailPage({ guest, bindings = [], licenses = [], events = [], csrf, error = '' }) {
  const suspended = String(guest.status).toUpperCase() === 'SUSPENDED';
  const bindingRows = bindings.length ? bindings.map((b) => `
    <tr>
      <td data-label="License"><a class="cell-main link" href="/licenses/${b.license_id}">${esc(b.label || b.license_uid)}</a><div class="cell-sub mono">${esc(b.license_uid)}</div></td>
      <td data-label="Permissions"><span class="chip ${b.can_install ? 'ok' : 'bad'}">Install</span> <span class="chip ${b.can_launch ? 'ok' : 'bad'}">Launch</span> <span class="chip ${b.can_update ? 'ok' : 'bad'}">Update</span> <span class="chip ${b.can_restart ? 'ok' : 'bad'}">Restart</span></td>
      <td data-label="Status">${statusBadge(b.status)}</td>
      <td data-label="" class="actions"><form method="post" action="/guests/${guest.id}/action">${csrfInput(csrf)}<input type="hidden" name="action" value="binding_remove"><input type="hidden" name="license_id" value="${b.license_id}"><button class="btn btn-sm btn-danger" type="submit" onclick="return askConfirm(this.form,'Remove this binding?','The guest will no longer be authorized for this license.','danger')">Remove</button></form></td>
    </tr>`).join('') : `<tr><td colspan="4">${emptyState('link', 'No license bindings', 'Bind this guest to at least one license to authorize operations.')}</td></tr>`;

  const licenseOptions = licenses.length ? licenses.map((l) => `<option value="${l.id}">${esc(l.label || l.license_uid)} · ${esc(l.license_uid)}</option>`).join('') : `<option value="">No licenses</option>`;

  const eventRows = events.length ? events.map((e) => `
    <tr><td data-label="Event"><div class="cell-main">${esc(String(e.event_type || '').replace(/_/g, ' '))}</div><div class="cell-sub">${esc(e.detail || e.error_code || '—')}</div></td><td data-label="Result">${statusBadge(e.result === 'ALLOW' ? 'ACTIVE' : e.result)}</td><td data-label="Time">${timeCell(e.created_at)}</td></tr>`).join('') : `<tr><td colspan="3" class="table-empty">No guest events yet.</td></tr>`;

  return `
    ${pageHeader({
      eyebrow: `Guest · ${guest.package_name}`,
      title: guest.app_name || guest.package_name,
      subtitle: `Version ${guest.version_code} · Registered ${esc(fmtDate(guest.created_at))} · ${statusBadge(guest.status)}`,
      actions: `<a class="btn" href="/guests">${icon('chevron-left', 16)} Back</a>
        <form method="post" action="/guests/${guest.id}/action" style="display:inline">${csrfInput(csrf)}<input type="hidden" name="action" value="${suspended ? 'reactivate' : 'suspend'}"><button class="btn ${suspended ? 'btn-primary' : 'btn-danger'}" type="submit" onclick="return askConfirm(this.form,'${suspended ? 'Reactivate' : 'Suspend'} this guest?','${suspended ? 'Bound licenses will be allowed again.' : 'All guest operations for this app are denied immediately.'}','${suspended ? '' : 'danger'}')">${icon(suspended ? 'check' : 'ban', 15)} ${suspended ? 'Reactivate' : 'Suspend'}</button></form>`,
    })}
    ${error ? `<div class="alert alert-bad"><span class="alert-ic">${icon('alert', 18)}</span><div class="alert-body">${esc(error)}</div></div>` : ''}
    <div class="detail-grid">
      <div class="stack">
        <div class="card">
          ${sectionHead('Approved identity')}
          <dl class="kv">
            <dt>Package</dt><dd class="mono">${esc(guest.package_name)}</dd>
            <dt>App name</dt><dd>${esc(guest.app_name || '—')}</dd>
            <dt>APK SHA-256</dt><dd class="mono">${esc(guest.apk_sha256)}</dd>
            <dt>Signer SHA-256</dt><dd class="mono">${esc(guest.cert_sha256)}</dd>
            <dt>Version code</dt><dd>${esc(guest.version_code)}</dd>
            <dt>Status</dt><dd>${statusBadge(guest.status)}</dd>
            <dt>Updated</dt><dd>${esc(fmtDate(guest.updated_at))}</dd>
          </dl>
        </div>
        <div class="card tight">
          ${sectionHead('License bindings', 'A guest must be bound to the license that requests it.')}
          <div class="table-wrap" style="border:0;background:transparent"><table class="tbl"><thead><tr><th>License</th><th>Permissions</th><th>Status</th><th></th></tr></thead><tbody>${bindingRows}</tbody></table></div>
        </div>
        <div class="card tight">
          ${sectionHead('Guest events', 'Latest 20 security events for this guest.')}
          <div class="table-wrap" style="border:0;background:transparent"><table class="tbl"><thead><tr><th>Event</th><th>Result</th><th>Time</th></tr></thead><tbody>${eventRows}</tbody></table></div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          ${sectionHead('Bind to license')}
          <form method="post" action="/guests/${guest.id}/action">
            ${csrfInput(csrf)}<input type="hidden" name="action" value="binding_add">
            ${field('License', `<select name="license_id" ${licenses.length ? '' : 'disabled'}>${licenseOptions}</select>`)}
            <div class="stack" style="gap:7px;margin-top:10px">
              <label class="toggle-row" style="padding:8px 10px"><span class="toggle-copy"><b>Install</b></span><input type="checkbox" name="perm_install" value="1" checked></label>
              <label class="toggle-row" style="padding:8px 10px"><span class="toggle-copy"><b>Launch</b></span><input type="checkbox" name="perm_launch" value="1" checked></label>
              <label class="toggle-row" style="padding:8px 10px"><span class="toggle-copy"><b>Update</b></span><input type="checkbox" name="perm_update" value="1" checked></label>
              <label class="toggle-row" style="padding:8px 10px"><span class="toggle-copy"><b>Restart</b></span><input type="checkbox" name="perm_restart" value="1" checked></label>
            </div>
            <div class="form-actions"><button class="btn btn-primary btn-sm" type="submit" ${licenses.length ? '' : 'disabled'}>${icon('link', 14)} Bind</button></div>
          </form>
        </div>
        <div class="card">
          ${sectionHead('Approve a new build')}
          <form method="post" action="/guests/${guest.id}/action">
            ${csrfInput(csrf)}<input type="hidden" name="action" value="update">
            <div class="stack" style="gap:9px">
              ${field('App name', `<input name="app_name" value="${esc(guest.app_name || '')}" maxlength="120">`)}
              ${field('APK SHA-256', `<input name="apk_sha256" value="${esc(guest.apk_sha256)}" maxlength="80" required>`)}
              ${field('Signer SHA-256', `<input name="cert_sha256" value="${esc(guest.cert_sha256)}" maxlength="80" required>`)}
              ${field('Version code', `<input type="number" name="version_code" min="0" value="${esc(guest.version_code)}" required>`)}
            </div>
            <div class="form-actions"><button class="btn btn-primary btn-sm" type="submit">${icon('check', 14)} Update approved identity</button></div>
          </form>
        </div>
        <div class="card">
          ${sectionHead('Danger zone')}
          <p class="muted small" style="margin:0 0 12px">Deleting the app removes this approved identity, every license binding and the app slots it occupied. Security events stay for audit.</p>
          <form method="post" action="/guests/${guest.id}/action">
            ${csrfInput(csrf)}<input type="hidden" name="action" value="delete">
            <button class="btn btn-danger" style="width:100%" type="submit" onclick="return askConfirm(this.form,'Delete this guest app permanently?','The approved app, all of its license bindings and its app slots are deleted. This cannot be undone.','danger')">${icon('trash', 15)} Delete guest app</button>
          </form>
        </div>
      </div>
    </div>`;
}
