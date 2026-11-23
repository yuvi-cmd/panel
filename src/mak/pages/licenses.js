import {
  codeValue, emptyState, field, icon, licenseExpiry, licenseHostText, licenseStatusBadge,
  pageHeader, resultBadge, sectionHead, segmented, statusBadge, timeCell,
} from '../ui.js';
import { esc, fmtDate, fmtDateTime, relTime, truncate } from '../http.js';

function csrfInput(csrf) { return `<input type="hidden" name="_csrf" value="${esc(csrf)}">`; }

function dateInputValue(seconds) {
  if (!seconds) return '';
  return new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
}

export function licensesPage({ licenses = [], counts = {}, q = '', status = 'ALL', csrf, server }) {
  const rows = licenses.length ? licenses.map((l) => `
    <tr>
      <td data-label="License">
        <a class="cell-main link" href="/licenses/${l.id}">${esc(l.label || l.license_uid)}</a>
        <div class="cell-sub mono">${esc(l.license_uid)}${l.user_ref ? ` · ${esc(l.user_ref)}` : ''}</div>
      </td>
      <td data-label="Host">${licenseHostText(l)}</td>
      <td data-label="Devices"><span class="cell-main">${l.device_count || 0}</span><span class="muted"> / ${l.max_devices}</span></td>
      <td data-label="Activations"><span class="cell-main">${l.activation_count || 0}</span><span class="muted"> / ${l.max_activations}</span></td>
      <td data-label="Guest apps"><span class="chip acc">${icon('apps', 11)} ${l.guest_count || 0}</span></td>
      <td data-label="Expires">${licenseExpiry(l)}</td>
      <td data-label="Status">${licenseStatusBadge(l)}</td>
      <td data-label="" class="actions"><a class="btn btn-sm btn-ghost" href="/licenses/${l.id}">Open ${icon('chevron-right', 13)}</a></td>
    </tr>`).join('') : `<tr><td colspan="8">${emptyState('key', 'No licenses found', q || status !== 'ALL' ? 'Try a different search or status filter.' : 'Issue the first MAK to get started.', `<a class="btn btn-primary" href="/licenses/new">${icon('plus', 15)} Issue MAK</a>`)}</td></tr>`;

  const total = counts.active || 0;
  const content = `
    ${pageHeader({
      eyebrow: 'License control',
      title: 'MAK licenses',
      subtitle: 'Unique credentials, host binding, device limits and guest allow-lists.',
      actions: `<a class="btn" href="/logs">${icon('activity', 16)} Audit trail</a><a class="btn btn-primary" href="/licenses/new">${icon('plus', 16)} Issue MAK</a>`,
    })}
    ${!server.enabled ? `<div class="notice">${icon('alert', 17)}<div><b>Activation server is OFF.</b> New authorizations are being denied. The panel remains available. <a class="link" href="/settings">Turn it back on</a>.</div></div>` : ''}
    <div class="toolbar">
      <form class="search" method="get" action="/licenses">
        <input type="hidden" name="status" value="${esc(status)}">
        ${icon('search', 16)}
        <input name="q" value="${esc(q)}" placeholder="Search license ID, label, user or host package…" autocomplete="off">
      </form>
      ${segmented('/licenses', status, [
        { value: 'ALL', label: 'All', count: counts.total },
        { value: 'ACTIVE', label: 'Active', count: counts.active },
        { value: 'SUSPENDED', label: 'Suspended', count: counts.suspended },
        { value: 'EXPIRED', label: 'Expired', count: counts.expired },
        { value: 'REVOKED', label: 'Revoked', count: counts.revoked },
      ])}
    </div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>License</th><th>Host</th><th>Devices</th><th>Activations</th><th>Guest apps</th><th>Expires</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="table-foot"><span>${licenses.length} shown · ${total} active</span><span>MAK credentials are stored as SHA-256 verifiers</span></div>
    </div>`;
  return content;
}

export function newLicensePage({ csrf, guests = [], error = '', values = {}, defaultExpiry = '', server }) {
  const v = values || {};
  const guestCards = guests.length ? guests.map((g) => `
    <label class="check-card">
      <input type="checkbox" name="guest_ids" value="${g.id}" ${(v.guest_ids || []).includes(String(g.id)) ? 'checked' : ''}>
      <span><b>${esc(g.app_name || g.package_name)}</b><small>${esc(g.package_name)} · v${esc(g.version_code)}</small></span>
    </label>`).join('') : `<div class="empty" style="padding:20px"><div class="empty-ic">${icon('apps', 22)}</div><h3>No guest apps registered</h3><p>You can issue the license now and bind guests later.</p><a class="btn btn-sm" href="/guests/new">${icon('plus', 14)} Register guest</a></div>`;

  return `
    ${pageHeader({
      eyebrow: 'Issue credential',
      title: 'Issue a MAK',
      subtitle: 'The raw credential is shown once. Only its verifier is stored in D1.',
      actions: `<a class="btn" href="/licenses">${icon('chevron-left', 16)} Back</a>`,
    })}
    ${error ? `<div class="alert alert-bad"><span class="alert-ic">${icon('alert', 18)}</span><div class="alert-body">${esc(error)}</div></div>` : ''}
    <form method="post" action="/licenses/new">
      ${csrfInput(csrf)}
      <div class="detail-grid">
        <div class="stack">
          <div class="card">
            ${sectionHead('License identity', 'Metadata is never used instead of package/certificate checks.')}
            <div class="form-grid">
              ${field('Label', `<input name="label" value="${esc(v.label || '')}" placeholder="e.g. Rahul · monthly" maxlength="80" required>`)}
              ${field('User reference', `<input name="user_ref" value="${esc(v.user_ref || '')}" placeholder="Name, email or order ID" maxlength="120">`)}
              ${field('Duration', `<select name="duration" onchange="this.form.expires_on.parentElement.style.display=this.value==='custom'?'':'none'">
                ${[['1', '1 day'], ['3', '3 days'], ['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['60', '60 days'], ['90', '90 days'], ['180', '180 days'], ['365', '1 year'], ['730', '2 years'], ['lifetime', 'Lifetime (no expiry)'], ['custom', 'Custom date…']].map(([value, label]) => `<option value="${value}" ${String(v.duration || '30') === value ? 'selected' : ''}>${label}</option>`).join('')}
              </select>`, 'Server rejects every request once this duration ends.')}
              ${field('Custom expiry date', `<input type="date" name="expires_on" value="${esc(v.expires_on || defaultExpiry)}">`, 'Only used when Duration = Custom date.')}
              ${field('Session TTL (seconds)', `<input type="number" name="session_ttl" min="300" max="86400" value="${esc(v.session_ttl || 3600)}" required>`, 'Short-lived signed sessions. Default 1 hour.')}
              ${field('Max devices', `<input type="number" name="max_devices" min="1" max="100" value="${esc(v.max_devices || 1)}" required>`, 'Concurrent active device keys.')}
              ${field('Max activations', `<input type="number" name="max_activations" min="1" max="1000" value="${esc(v.max_activations || 2)}" required>`, 'Lifetime registrations, including reinstalls.')}
              ${field('Max host packages', `<input type="number" name="max_packages" min="1" max="100" value="${esc(v.max_packages || 1)}" required>`, 'Kitne host APK package names is MAK se bind ho sakte hain.')}
              ${field('Max apps per package', `<input type="number" name="max_apps" min="1" max="100" value="${esc(v.max_apps || 2)}" required>`, 'Har host package ke liye kitne guest apps. Total = packages × apps.')}
              ${field('Notes', `<textarea name="notes" placeholder="Internal note (not shown to the client)" maxlength="1000">${esc(v.notes || '')}</textarea>`, '', 'span-2')}
            </div>
          </div>
          <div class="card">
            ${sectionHead('Host binding', 'Package name + signing certificate SHA-256.')}
            <div class="form-grid">
              ${field('Host package name', `<input name="host_package" value="${esc(v.host_package || '')}" placeholder="com.example.host" maxlength="200">`, 'Optional in AUTO mode; required in MANUAL mode.')}
              ${field('Host app name', `<input name="host_app_name" value="${esc(v.host_app_name || '')}" placeholder="Display name (optional)" maxlength="120">`)}
              ${field('Signing certificate SHA-256', `<input name="host_cert" value="${esc(v.host_cert || '')}" placeholder="64 hex characters" maxlength="80">`, 'Lowercase or uppercase hex; colons are removed.')}
              ${field('Binding mode', `<select name="host_bind_mode">
                <option value="AUTO" ${v.host_bind_mode !== 'MANUAL' ? 'selected' : ''}>AUTO — pkg name + app name first use par bind</option>
                <option value="MANUAL" ${v.host_bind_mode === 'MANUAL' ? 'selected' : ''}>MANUAL — sirf pre-registered packages</option>
              </select>`, '', 'span-2')}
            </div>
            <div class="notice" style="margin:14px 0 0">${icon('shield', 17)}<div><b>AUTO:</b> pehle <b>Max host packages</b> packages khud bind honge (pkg + app name + cert). <b>MANUAL:</b> sirf yahan diya gaya package authenticate kar sakta hai.</div></div>
          </div>
          <div class="card">
            ${sectionHead('Guest access', 'Only these guest apps will receive signed ALLOW decisions.')}
            <div class="check-grid">${guestCards}</div>
          </div>
        </div>
        <div class="stack">
          <div class="card reveal">
            ${sectionHead('What happens next')}
            <div class="timeline">
              <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-main"><b>Credential generated</b><p>100-bit random MAK, formatted and hashed with SHA-256.</p></div></div>
              <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-main"><b>One-time reveal</b><p>The raw key is shown once and never stored in plaintext.</p></div></div>
              <div class="timeline-item"><span class="timeline-dot ok"></span><div class="timeline-main"><b>Silent host auth</b><p>Your host APK calls /challenge then /authorize automatically.</p></div></div>
              <div class="timeline-item"><span class="timeline-dot ok"></span><div class="timeline-main"><b>Native guest gate</b><p>Each install / launch receives a signed guest authorization.</p></div></div>
            </div>
            <div class="divider"></div>
            <div class="notice" style="margin:0">${icon('lock', 17)}<div><b>No activation UI.</b> The credential lives in the host APK and is bootstrapped silently.</div></div>
          </div>
          <div class="card">
            ${sectionHead('Server state')}
            <dl class="kv">
              <dt>Activation API</dt><dd>${statusBadge(server.enabled ? 'ONLINE' : 'OFFLINE')}</dd>
              <dt>Response signing</dt><dd>${statusBadge(server.signingReady ? 'ACTIVE' : 'SUSPENDED')}</dd>
              <dt>Protocol</dt><dd><span class="mono">MAK/2</span></dd>
            </dl>
            ${!server.signingReady ? `<div class="notice" style="margin:14px 0 0">${icon('shield-alert', 17)}<div>You can issue the key now, but authorization stays closed until the signing secret is configured.</div></div>` : ''}
          </div>
          <button class="btn btn-primary" type="submit" style="width:100%;padding:13px">${icon('key', 17)} Issue MAK credential</button>
          <p class="muted" style="font-size:10.5px;text-align:center;margin:0">By issuing, you confirm the host identity is trusted.</p>
        </div>
      </div>
    </form>`;
}

export function revealLicensePage({ license, credential, csrf, server }) {
  return `
    ${pageHeader({
      eyebrow: 'Credential issued',
      title: 'Save this MAK now',
      subtitle: 'This is the only time the raw credential will be displayed.',
      actions: `<a class="btn" href="/licenses/${license.id}">${icon('arrow-right', 16)} Open license</a>`,
    })}
    <div class="card reveal">
      <div class="spread" style="margin-bottom:14px"><div><div class="eyebrow" style="margin-bottom:4px">One-time reveal</div><h3 style="margin:0">${esc(license.label || license.license_uid)}</h3></div>${statusBadge('ACTIVE')}</div>
      ${codeValue('new-mak', credential, { tall: true })}
      <div class="row" style="margin-top:12px">
        <button class="btn" type="button" onclick="downloadText('new-mak','mak-${esc(license.license_uid)}.txt',this)">${icon('download', 15)} Download .txt</button>
        <span class="muted" style="font-size:10.5px">Raw key is never stored. Only its SHA-256 verifier remains in D1.</span>
      </div>
      <div class="divider"></div>
      <dl class="kv">
        <dt>License ID</dt><dd class="mono">${esc(license.license_uid)}</dd>
        <dt>Expires</dt><dd>${esc(fmtDate(license.expires_at))}</dd>
        <dt>Devices / activations</dt><dd>${license.max_devices} / ${license.max_activations}</dd>
        <dt>Host packages / apps</dt><dd>${license.max_packages || 1} packages × ${license.max_apps || 2} apps = ${(license.max_packages || 1) * (license.max_apps || 2)} apps</dd>
        <dt>Host binding</dt><dd>${String(license.host_bind_mode || 'AUTO') === 'MANUAL' ? 'Manual (pre-registered)' : 'Auto (first use)'}</dd>
        <dt>Server</dt><dd>${statusBadge(server.enabled ? 'ONLINE' : 'OFFLINE')}</dd>
      </dl>
      <div class="alert alert-bad" style="margin:16px 0 0"><span class="alert-ic">${icon('alert', 18)}</span><div class="alert-body">Store this key in the host APK's credential field. Anyone with it can attempt to activate a matching host. Rotate immediately if it leaks.</div></div>
      <div class="form-actions"><a class="btn btn-primary" href="/licenses/${license.id}">I have saved it ${icon('arrow-right', 15)}</a></div>
    </div>
    <script>try{history.replaceState({},'','/licenses/${license.id}')}catch(e){}</script>`;
}

export function licenseDetailPage({
  license, host, hosts = [], bindings = [], allGuests = [], devices = [], sessions = [], events = [], csrf, server,
}) {
  const guestRows = bindings.length ? bindings.map((b) => `
    <tr>
      <td data-label="Guest"><div class="cell-main">${esc(b.app_name || b.package_name)}</div><div class="cell-sub mono">${esc(b.package_name)} · v${esc(b.version_code)}</div></td>
      <td data-label="Permissions">
        <span class="chip ${b.can_install ? 'ok' : 'bad'}">Install</span>
        <span class="chip ${b.can_launch ? 'ok' : 'bad'}">Launch</span>
        <span class="chip ${b.can_update ? 'ok' : 'bad'}">Update</span>
        <span class="chip ${b.can_restart ? 'ok' : 'bad'}">Restart</span>
      </td>
      <td data-label="Status">${statusBadge(b.status)}</td>
      <td data-label="" class="actions">
        <a class="btn btn-sm btn-ghost" href="/guests/${b.guest_app_id}">Details</a>
        <form method="post" action="/licenses/${license.id}/action" style="display:inline">${csrfInput(csrf)}<input type="hidden" name="action" value="binding_remove"><input type="hidden" name="guest_id" value="${b.guest_app_id}"><button class="btn btn-sm btn-danger" type="submit" onclick="return askConfirm(this.form,'Remove guest access?','Signed guest authorizations will stop for this application.','danger')">Remove</button></form>
      </td>
    </tr>`).join('') : `<tr><td colspan="4">${emptyState('apps', 'No guest apps bound', 'Bind an approved guest app to authorize install and launch operations.')}</td></tr>`;

  const guestOptions = allGuests.length ? allGuests.map((g) => `<option value="${g.id}">${esc(g.app_name || g.package_name)} · ${esc(g.package_name)} · v${esc(g.version_code)}</option>`).join('') : `<option value="">No approved guest apps</option>`;

  const deviceRows = devices.length ? devices.map((d) => `
    <tr>
      <td data-label="Device"><div class="cell-main mono">${esc(d.fingerprint)}</div><div class="cell-sub">${esc(d.device_uid)}</div></td>
      <td data-label="Status">${statusBadge(d.status)}</td>
      <td data-label="Last seen">${timeCell(d.last_seen)}</td>
      <td data-label="" class="actions">
        <form method="post" action="/licenses/${license.id}/action" style="display:inline">${csrfInput(csrf)}<input type="hidden" name="action" value="device_revoke"><input type="hidden" name="device_id" value="${d.id}"><button class="btn btn-sm btn-danger" type="submit" ${d.status !== 'ACTIVE' ? 'disabled' : ''} onclick="return askConfirm(this.form,'Revoke this device?','Its sessions will be revoked and it must be re-authorized.','danger')">Revoke</button></form>
        <form method="post" action="/licenses/${license.id}/action" style="display:inline">${csrfInput(csrf)}<input type="hidden" name="action" value="device_delete"><input type="hidden" name="device_id" value="${d.id}"><button class="btn btn-sm btn-ghost" type="submit" onclick="return askConfirm(this.form,'Delete device record?','The device row is removed, but audit events remain. This frees the key slot for a fresh registration.','danger')">Delete</button></form>
      </td>
    </tr>`).join('') : `<tr><td colspan="4">${emptyState('smartphone', 'No devices yet', 'The first successful /authorize call registers a P-256 public key.')}</td></tr>`;

  const sessionRows = sessions.length ? sessions.map((s) => `
    <tr>
      <td data-label="Session"><div class="cell-main mono">${esc(truncate(s.id, 26))}</div><div class="cell-sub">Issued ${esc(relTime(s.issued_at))}</div></td>
      <td data-label="Status">${statusBadge(s.status === 'REVOKED' ? 'REVOKED' : (Number(s.expires_at) <= Math.floor(Date.now() / 1000) ? 'EXPIRED' : 'ACTIVE'))}</td>
      <td data-label="Expires">${esc(fmtDateTime(s.expires_at))}</td>
      <td data-label="Heartbeat">${timeCell(s.last_heartbeat)}</td>
      <td data-label="" class="actions"><form method="post" action="/licenses/${license.id}/action" style="display:inline">${csrfInput(csrf)}<input type="hidden" name="action" value="session_revoke"><input type="hidden" name="session_id" value="${esc(s.id)}"><button class="btn btn-sm btn-danger" type="submit" ${s.status !== 'ACTIVE' ? 'disabled' : ''} onclick="return confirm('Revoke this session?')">Revoke</button></form></td>
    </tr>`).join('') : `<tr><td colspan="5">${emptyState('radio', 'No sessions', 'A session is created after host + device authorization.')}</td></tr>`;

  const eventItems = events.length ? events.map((e) => `
    <div class="timeline-item">
      <span class="timeline-dot ${e.result === 'DENY' || e.result === 'ERROR' ? 'bad' : e.result === 'ALLOW' || e.result === 'SUCCESS' ? 'ok' : ''}"></span>
      <div class="timeline-main"><b>${esc(String(e.event_type || '').replace(/_/g, ' '))}</b><p>${esc(e.detail || e.error_code || '—')}</p></div>
      <span class="timeline-time">${esc(relTime(e.created_at))}</span>
    </div>`).join('') : `<div class="empty" style="padding:22px"><div class="empty-ic">${icon('activity', 22)}</div><h3>No events</h3><p>License activity will appear here.</p></div>`;

  const effective = licenseStatusBadge(license);
  const suspended = String(license.status).toUpperCase() === 'SUSPENDED';
  const revoked = String(license.status).toUpperCase() === 'REVOKED';

  return `
    ${pageHeader({
      eyebrow: `License · ${license.license_uid}`,
      title: esc(license.label || 'Untitled license'),
      subtitle: `Created ${esc(fmtDate(license.created_at))} · ${license.user_ref ? esc(license.user_ref) : 'No user reference'} · ${effective}`,
      actions: `<a class="btn" href="/licenses">${icon('chevron-left', 16)} Back</a>
        ${!revoked ? `<form method="post" action="/licenses/${license.id}/action" style="display:inline">${csrfInput(csrf)}<input type="hidden" name="action" value="${suspended ? 'reactivate' : 'suspend'}"><button class="btn ${suspended ? 'btn-primary' : 'btn-danger'}" type="submit" onclick="return askConfirm(this.form,'${suspended ? 'Reactivate' : 'Suspend'} this license?','${suspended ? 'New authorizations will be allowed again.' : 'Active sessions are revoked and new authorizations are denied.'}','${suspended ? '' : 'danger'}')">${icon(suspended ? 'check' : 'ban', 15)} ${suspended ? 'Reactivate' : 'Suspend'}</button></form>` : ''}
        <form method="post" action="/licenses/${license.id}/action" style="display:inline">${csrfInput(csrf)}<input type="hidden" name="action" value="rotate"><button class="btn" type="submit" onclick="return askConfirm(this.form,'Rotate MAK credential?','The old credential stops working immediately and all sessions are revoked. The new key is shown once.','danger')">${icon('rotate', 15)} Rotate</button></form>
        ${!revoked ? `<form method="post" action="/licenses/${license.id}/action" style="display:inline">${csrfInput(csrf)}<input type="hidden" name="action" value="revoke"><button class="btn btn-danger" type="submit" onclick="return askConfirm(this.form,'Revoke this license permanently?','Every device and session is denied. This cannot be undone from the client side.','danger')">${icon('trash', 15)} Revoke</button></form>` : ''}`,
    })}
    <div class="detail-grid">
      <div class="stack">
        <div class="card">
          ${sectionHead('Policy', 'Every field is enforced by the server on the next request.')}
          <form method="post" action="/licenses/${license.id}/action">
            ${csrfInput(csrf)}
            <input type="hidden" name="action" value="update_policy">
            <div class="form-grid">
              ${field('Label', `<input name="label" value="${esc(license.label)}" maxlength="80" required>`)}
              ${field('User reference', `<input name="user_ref" value="${esc(license.user_ref)}" maxlength="120">`)}
              ${field('Duration', `<select name="duration" onchange="this.form.expires_on.parentElement.style.display=this.value==='custom'?'':'none'">
                ${[['1', '1 day'], ['3', '3 days'], ['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['60', '60 days'], ['90', '90 days'], ['180', '180 days'], ['365', '1 year'], ['730', '2 years'], ['lifetime', 'Lifetime (no expiry)'], ['custom', 'Custom date…']].map(([value, label]) => `<option value="${value}" ${(license.expires_at ? 'custom' : 'lifetime') === value ? 'selected' : ''}>${label}</option>`).join('')}
              </select>`, 'Server rejects every request once this duration ends.')}
              ${field('Custom expiry date', `<input type="date" name="expires_on" value="${esc(dateInputValue(license.expires_at))}">`, 'Only used when Duration = Custom date.')}
              ${field('Session TTL (seconds)', `<input type="number" name="session_ttl" min="300" max="86400" value="${license.session_ttl}" required>`)}
              ${field('Max devices', `<input type="number" name="max_devices" min="1" max="100" value="${license.max_devices}" required>`)}
              ${field('Max activations', `<input type="number" name="max_activations" min="1" max="1000" value="${license.max_activations}" required>`)}
              ${field('Max host packages', `<input type="number" name="max_packages" min="1" max="100" value="${license.max_packages || 1}" required>`, 'Kitne host APK package names is MAK se bind ho sakte hain.')}
              ${field('Max apps per package', `<input type="number" name="max_apps" min="1" max="100" value="${license.max_apps || 2}" required>`, 'Har host package ke liye kitne guest apps.')}
              ${field('Max installs per package', `<input type="number" name="max_installs" min="1" max="100" value="${license.max_installs || 3}" required>`, 'Active grants (seats) per host package.')}
              ${field('Signature Bind', `<select name="signature_bind">
                <option value="1" ${Number(license.signature_bind ?? 1) ? 'selected' : ''}>Yes — verify APK signature</option>
                <option value="0" ${!Number(license.signature_bind ?? 1) ? 'selected' : ''}>No — package + app name only</option>
              </select>`, 'Yes par host aur har app ka certificate verify hoga.')}
              ${field('Binding mode', `<select name="host_bind_mode">
                <option value="AUTO" ${String(license.host_bind_mode || 'AUTO') !== 'MANUAL' ? 'selected' : ''}>AUTO — first use par bind</option>
                <option value="MANUAL" ${String(license.host_bind_mode || 'AUTO') === 'MANUAL' ? 'selected' : ''}>MANUAL — sirf pre-registered</option>
              </select>`, '', 'span-2')}
              ${field('Notes', `<textarea name="notes" maxlength="1000">${esc(license.notes || '')}</textarea>`, '', 'span-2')}
            </div>
            <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('check', 15)} Save policy</button></div>
          </form>
          <div class="divider"></div>
          <div class="row" style="justify-content:space-between">
            <div><div class="kpi-label">Activations used</div><div class="cell-main">${license.activation_count} of ${license.max_activations}</div></div>
            <div style="flex:1;max-width:240px"><div class="meter"><span style="width:${Math.min(100, Math.round((Number(license.activation_count || 0) / Math.max(1, Number(license.max_activations))) * 100))}%"></span></div></div>
          </div>
        </div>

        <div class="card">
          ${sectionHead('Host packages', 'Package name + signing certificate must both match. ' + Number(hosts.length || 0) + ' / ' + Number(license.max_packages || 1) + ' used.', host ? statusBadge(host.status) : statusBadge('PENDING'))}
          ${hosts.length ? `<div class="table-wrap" style="border:0;background:transparent"><table class="tbl" style="min-width:0"><thead><tr><th>Package</th><th>App</th><th>Status</th><th></th></tr></thead><tbody>${hosts.map((h) => `
            <tr>
              <td data-label="Package"><div class="cell-main mono">${esc(h.package_name)}</div><div class="cell-sub mono">${esc(h.cert_sha256)}</div></td>
              <td data-label="App">${esc(h.app_name || '—')}</td>
              <td data-label="Status">${statusBadge(h.status)}</td>
              <td data-label="" class="actions"><form method="post" action="/licenses/${license.id}/action" style="display:inline">${csrfInput(csrf)}<input type="hidden" name="action" value="host_reset"><input type="hidden" name="host_id" value="${h.id}"><button class="btn btn-sm btn-danger" type="submit" onclick="return askConfirm(this.form,'Remove this host package?','Sessions are revoked. This package can be auto-bound again in AUTO mode.','danger')">Remove</button></form></td>
            </tr>`).join('')}</tbody></table></div>` : `<div class="notice" style="margin:0">${icon('clock', 17)}<div><b>${String(license.host_bind_mode || 'AUTO') === 'MANUAL' ? 'Manual binding.' : 'Auto binding enabled.'}</b> ${String(license.host_bind_mode || 'AUTO') === 'MANUAL' ? 'Only the packages you register here can authenticate.' : 'The first ' + Number(license.max_packages || 1) + ' host packages will bind on first authenticated use.'}</div></div>`}
          <details style="margin-top:14px">
            <summary class="btn btn-sm btn-ghost" style="list-style:none;display:inline-flex">${icon('edit', 14)} ${hosts.length ? 'Add / update host package' : 'Pre-register host'}</summary>
            <form method="post" action="/licenses/${license.id}/action" style="margin-top:12px">
              ${csrfInput(csrf)}<input type="hidden" name="action" value="host_save">
              <div class="form-grid">
                ${field('Package name', `<input name="host_package" placeholder="com.example.host" required>`)}
                ${field('App name', `<input name="host_app_name" placeholder="Display name (optional)">`)}
                ${field('Certificate SHA-256', `<input name="host_cert" placeholder="64 hex characters" required>`, '', 'span-2')}
              </div>
              <div class="form-actions"><button class="btn btn-primary btn-sm" type="submit" onclick="return askConfirm(this.form,'Save host package?','All active sessions will be revoked. New authorization must match the package and certificate.','danger')">Save package</button></div>
            </form>
          </details>
          ${hosts.length ? `<div class="divider"></div><div class="row" style="justify-content:space-between"><span class="muted small">Reset removes every package pin.</span><form method="post" action="/licenses/${license.id}/action">${csrfInput(csrf)}<input type="hidden" name="action" value="host_reset"><button class="btn btn-sm btn-danger" type="submit" onclick="return askConfirm(this.form,'Reset all host packages?','Active sessions are revoked and every package pin is removed.','danger')">Reset all</button></form></div>` : ''}
        </div>

        <div class="card tight">
          ${sectionHead('Devices', 'P-256 public keys registered against this license.', `<a class="btn btn-sm btn-ghost" href="/devices?q=${encodeURIComponent(license.license_uid)}">All devices ${icon('arrow-right', 13)}</a>`)}
          <div class="table-wrap" style="border:0;border-radius:0;background:transparent"><table class="tbl"><thead><tr><th>Device</th><th>Status</th><th>Last seen</th><th></th></tr></thead><tbody>${deviceRows}</tbody></table></div>
        </div>

        <div class="card tight">
          ${sectionHead('Sessions', 'Short-lived authorization state.', `<a class="btn btn-sm btn-ghost" href="/sessions?q=${encodeURIComponent(license.license_uid)}">All sessions ${icon('arrow-right', 13)}</a>`)}
          <div class="table-wrap" style="border:0;border-radius:0;background:transparent"><table class="tbl"><thead><tr><th>Session</th><th>Status</th><th>Expires</th><th>Heartbeat</th><th></th></tr></thead><tbody>${sessionRows}</tbody></table></div>
        </div>

        <div class="card">
          ${sectionHead('Recent activity', 'Only this license. Raw keys and proofs are never logged.')}
          <div class="timeline">${eventItems}</div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          ${sectionHead('Guest access')}
          <div class="table-wrap" style="border:0;background:transparent"><table class="tbl" style="min-width:0"><thead><tr><th>Guest</th><th>Permissions</th><th>Status</th><th></th></tr></thead><tbody>${guestRows}</tbody></table></div>
          <div class="divider"></div>
          <form method="post" action="/licenses/${license.id}/action">
            ${csrfInput(csrf)}<input type="hidden" name="action" value="binding_add">
            ${field('Bind approved guest', `<select name="guest_id" ${allGuests.length ? '' : 'disabled'}>${guestOptions}</select>`)}
            <div class="row" style="margin-top:9px;gap:14px">
              <label class="toggle-row" style="padding:7px 9px;flex:1"><span class="toggle-copy"><b>Install</b></span><input type="checkbox" name="perm_install" value="1" checked></label>
              <label class="toggle-row" style="padding:7px 9px;flex:1"><span class="toggle-copy"><b>Launch</b></span><input type="checkbox" name="perm_launch" value="1" checked></label>
              <label class="toggle-row" style="padding:7px 9px;flex:1"><span class="toggle-copy"><b>Update</b></span><input type="checkbox" name="perm_update" value="1" checked></label>
              <label class="toggle-row" style="padding:7px 9px;flex:1"><span class="toggle-copy"><b>Restart</b></span><input type="checkbox" name="perm_restart" value="1" checked></label>
            </div>
            <div class="form-actions"><button class="btn btn-primary btn-sm" type="submit" ${allGuests.length ? '' : 'disabled'}>${icon('link', 14)} Bind guest</button></div>
          </form>
        </div>

        <div class="card">
          ${sectionHead('Device allowance')}
          <p class="muted small" style="margin:0 0 12px">Reset revokes every active device and session. The lifetime activation counter is preserved.</p>
          <form method="post" action="/licenses/${license.id}/action">${csrfInput(csrf)}<input type="hidden" name="action" value="devices_reset"><button class="btn btn-danger" style="width:100%" type="submit" onclick="return askConfirm(this.form,'Reset all devices?','Every active device and session is revoked. Devices must authorize again, and the activation counter still applies.','danger')">${icon('rotate', 15)} Reset device allowance</button></form>
        </div>

        <div class="card">
          ${sectionHead('Credential')}
          <dl class="kv">
            <dt>License ID</dt><dd class="mono">${esc(license.license_uid)}</dd>
            <dt>Created</dt><dd>${esc(fmtDate(license.created_at))}</dd>
            <dt>Last used</dt><dd>${timeCell(license.last_used_at)}</dd>
            <dt>Rotated</dt><dd>${license.rotated_at ? esc(fmtDate(license.rotated_at)) : 'Never'}</dd>
            <dt>Status</dt><dd>${effective}</dd>
          </dl>
          <div class="notice" style="margin:14px 0 0">${icon('lock', 17)}<div>The MAK is not recoverable. Rotate to generate and reveal a new one.</div></div>
        </div>
      </div>
    </div>`;
}
