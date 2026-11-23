import { emptyState, icon, pageHeader, resultBadge, sectionHead, segmented, statusBadge, timeCell } from '../ui.js';
import { esc, truncate } from '../http.js';

export function logsPage({ events = [], resultCounts = {}, q = '', result = 'ALL', type = '', types = [], csrf }) {
  const rows = events.length ? events.map((e) => `
    <tr>
      <td data-label="Event">
        <div class="cell-main">${esc(String(e.event_type || '').replace(/_/g, ' '))}</div>
        <div class="cell-sub">${esc(truncate(e.detail || e.error_code || '—', 90))}</div>
      </td>
      <td data-label="License">${e.license_id ? `<a class="link" href="/licenses/${e.license_id}">${esc(e.label || e.license_uid)}</a>` : '<span class="muted">—</span>'}</td>
      <td data-label="Result">${resultBadge(e.result)}</td>
      <td data-label="Code"><span class="mono small">${esc(e.error_code || '—')}</span></td>
      <td data-label="Actor"><span class="chip">${esc(e.actor || 'CLIENT')}</span></td>
      <td data-label="Request"><span class="mono small">${esc(e.request_id ? truncate(e.request_id, 20) : '—')}</span></td>
      <td data-label="Time" class="nowrap">${timeCell(e.created_at)}</td>
    </tr>`).join('') : `<tr><td colspan="7">${emptyState('activity', 'No security events', q || result !== 'ALL' || type ? 'No event matches this filter.' : 'Allow / deny decisions and native security events will appear here.')}</td></tr>`;

  const typeOptions = ['', ...types].map((t) => `<option value="${esc(t)}" ${t === type ? 'selected' : ''}>${esc(t ? t.replace(/_/g, ' ') : 'All event types')}</option>`).join('');

  return `
    ${pageHeader({
      eyebrow: 'Audit trail',
      title: 'Security logs',
      subtitle: 'Signed decisions, revocations and native reports. Raw credentials and proofs are never logged.',
      actions: `<a class="btn" href="/sessions">${icon('radio', 16)} Sessions</a><a class="btn" href="/licenses">${icon('key', 16)} Licenses</a>`,
    })}
    <div class="toolbar">
      <form class="search" method="get" action="/logs">
        <input type="hidden" name="result" value="${esc(result)}">
        <input type="hidden" name="type" value="${esc(type)}">
        ${icon('search', 16)}
        <input name="q" value="${esc(q)}" placeholder="Search event, code, detail or license…" autocomplete="off">
      </form>
      <form method="get" action="/logs" class="row" style="gap:8px">
        <input type="hidden" name="result" value="${esc(result)}">
        <input type="hidden" name="q" value="${esc(q)}">
        <select name="type" onchange="this.form.submit()" style="min-width:190px">${typeOptions}</select>
      </form>
      ${segmented('/logs', result, [
        { value: 'ALL', label: 'All', count: resultCounts.total },
        { value: 'ALLOW', label: 'Allow', count: resultCounts.allow },
        { value: 'DENY', label: 'Deny', count: resultCounts.deny },
        { value: 'ERROR', label: 'Error', count: resultCounts.error },
        { value: 'INFO', label: 'Info', count: resultCounts.info },
      ])}
    </div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>Event</th><th>License</th><th>Result</th><th>Code</th><th>Actor</th><th>Request</th><th>Time</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="table-foot"><span>${events.length} shown</span><span>Retention is controlled by D1; export before pruning</span></div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        ${sectionHead('Reading the log')}
        <dl class="kv">
          <dt>ALLOW</dt><dd>Signed authorization issued</dd>
          <dt>DENY</dt><dd>Fail-closed decision</dd>
          <dt>ERROR</dt><dd>Client-reported native failure</dd>
          <dt>INFO</dt><dd>Lifecycle / audit metadata</dd>
        </dl>
      </div>
      <div class="card">
        ${sectionHead('Codes to watch')}
        <div class="row" style="gap:6px">
          ${['NONCE_REPLAY', 'INVALID_DEVICE_PROOF', 'HOST_CERT_MISMATCH', 'GUEST_HASH_MISMATCH', 'SESSION_REVOKED', 'SERVER_DISABLED'].map((c) => `<span class="chip bad">${c}</span>`).join('')}
        </div>
        <p class="muted small" style="margin:12px 0 0">Repeated failures from one license usually mean a stale host build, a rotated certificate, or a leaked credential.</p>
      </div>
    </div>`;
}
