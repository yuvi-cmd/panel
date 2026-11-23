import { codeValue, field, icon, pageHeader, sectionHead, statusBadge } from '../ui.js';
import { esc, fmtDateTime } from '../../backend/http.js';

function csrfInput(csrf) { return `<input type="hidden" name="_csrf" value="${esc(csrf)}">`; }

export function settingsPage({
  admin, csrf, server, signing, settings, stats = {}, panelName = 'MUNDO MAK', error = '', ok = '',
}) {
  const on = !!server.enabled;
  const keys = signing?.keys || [];

  const keyRows = keys.length ? keys.map((k, i) => `
    <div class="stack" style="gap:6px;margin-bottom:12px">
      <div class="spread">
        <div class="row" style="gap:7px">
          <span class="chip acc">${icon('key', 11)} ${esc(k.key_id)}</span>
          ${k.active ? '<span class="badge ok"><span class="badge-dot"></span>ACTIVE</span>' : '<span class="badge neutral">STANDBY</span>'}
        </div>
        <span class="muted small">Ed25519</span>
      </div>
      ${codeValue(`pubkey-${i}`, k.public_key)}
    </div>`).join('') : `<div class="empty" style="padding:22px"><div class="empty-ic">${icon('shield-alert', 22)}</div><h3>No signing key</h3><p>Public keys appear here after MAK_SIGNING_KEY is configured.</p></div>`;

  return `
    ${pageHeader({
      eyebrow: 'Configuration',
      title: 'Settings',
      subtitle: 'Global server switch, protocol timings, signing identity and administrator security.',
      actions: `<a class="btn" href="/mak/v1/status" target="_blank" rel="noopener">${icon('external', 16)} Protocol status</a>`,
    })}
    ${error ? `<div class="alert alert-bad"><span class="alert-ic">${icon('alert', 18)}</span><div class="alert-body">${esc(error)}</div></div>` : ''}
    <div class="detail-grid">
      <div class="stack">
        <div class="card">
          ${sectionHead('Activation server', 'The global kill switch applies before every MAK/1 decision.', statusBadge(on ? 'ONLINE' : 'OFFLINE'))}
          ${!on ? `<div class="notice" style="margin:0 0 12px">${icon('ban', 17)}<div><b>All activation endpoints are failing closed.</b> Hosts receive a signed SERVER_DISABLED denial. The panel stays available.</div></div>` : ''}
          <form method="post" action="/settings/server">
            ${csrfInput(csrf)}
            <input type="hidden" name="action" value="save">
            <label class="toggle-row" style="margin-bottom:12px">
              <span class="toggle-copy"><b>Activation decisions enabled</b><small>Turning this off immediately denies authorize, guest checks, renew and heartbeat.</small></span>
              <span class="switch"><input type="checkbox" name="server_enabled" value="1" ${on ? 'checked' : ''}><span class="switch-track"></span><span class="switch-thumb"></span></span>
            </label>
            <div class="form-grid">
              ${field('Maintenance message', `<input name="maintenance_message" value="${esc(settings.maintenance_message)}" maxlength="300" required>`, 'Returned with SERVER_DISABLED denials.')}
              ${field('Operator announcement', `<input name="announcement" value="${esc(settings.announcement)}" maxlength="500" placeholder="Optional dashboard note">`, 'Shown on the overview page.')}
            </div>
            <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('check', 15)} Save server state</button></div>
          </form>
          ${!signing.ok ? `<div class="divider"></div><div class="alert alert-bad" style="margin:0"><span class="alert-ic">${icon('shield-alert', 18)}</span><div class="alert-body"><b>Signing is disabled.</b> ${esc(signing.reason || 'MAK_SIGNING_KEY is not configured.')} Activation cannot be enabled until a valid key is installed.</div></div>` : ''}
        </div>

        <div class="card">
          ${sectionHead('Protocol timings', 'Bounded values are enforced again at request time.')}
          <form method="post" action="/settings/protocol">
            ${csrfInput(csrf)}
            <div class="form-grid">
              ${field('Session TTL (seconds)', `<input type="number" name="session_ttl" min="60" max="86400" value="${settings.session_ttl}" required>`, 'Default authorization session lifetime.')}
              ${field('Heartbeat interval (seconds)', `<input type="number" name="heartbeat_interval" min="30" max="3600" value="${settings.heartbeat_interval}" required>`, 'Client heartbeat cadence.')}
              ${field('Challenge TTL (seconds)', `<input type="number" name="challenge_ttl" min="15" max="300" value="${settings.challenge_ttl}" required>`, 'Single-use nonce lifetime.')}
              ${field('Clock skew (seconds)', `<input type="number" name="clock_skew" min="30" max="900" value="${settings.clock_skew}" required>`, 'Accepted request timestamp drift.')}
              ${field('Guest auth TTL (seconds)', `<input type="number" name="authorization_ttl" min="30" max="600" value="${settings.authorization_ttl}" required>`, 'Validity of each signed guest decision.')}
              ${field('Server version label', `<input name="server_version" value="${esc(settings.server_version)}" maxlength="32" pattern="[A-Za-z0-9._-]{1,32}" required>`)}
            </div>
            <div style="margin-top:14px">
              <label class="toggle-row">
                <span class="toggle-copy"><b>Require device proof on guest checks</b><small>Every guest operation must carry a fresh P-256 signature from the bound device.</small></span>
                <span class="switch"><input type="checkbox" name="guest_proof_required" value="1" ${settings.guest_proof_required ? 'checked' : ''}><span class="switch-track"></span><span class="switch-thumb"></span></span>
              </label>
            </div>
            <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('sliders', 15)} Save protocol settings</button></div>
          </form>
        </div>

        <div class="card">
          ${sectionHead('Signing identity', 'Ed25519 keys sign every MAK/1 response. Private seeds live only in Worker secrets.')}
          <div class="spread" style="margin-bottom:12px">
            <span class="muted small">Signing status</span>
            ${signing.ok ? statusBadge('ACTIVE') : statusBadge('SUSPENDED')}
          </div>
          ${keyRows}
          ${!signing.ok ? `<div class="notice" style="margin:0">${icon('terminal', 17)}<div>Set the key, then redeploy the Worker:<div class="mono-block" style="margin-top:8px">openssl rand -base64 32 | npx wrangler secret put MAK_SIGNING_KEY</div></div></div>` : ''}
          <div class="divider"></div>
          <dl class="kv">
            <dt>Active key</dt><dd>${signing.ok ? esc(signing.active?.key_id || '—') : '—'}</dd>
            <dt>Key ring</dt><dd>${keys.length} public key${keys.length === 1 ? '' : 's'}</dd>
            <dt>Algorithm</dt><dd>Ed25519 (TweetNaCl)</dd>
            <dt>Domain separation</dt><dd class="mono">MAK/1 · RESPONSE</dd>
          </dl>
          <div class="notice" style="margin:14px 0 0">${icon('lock', 17)}<div><b>Rotation:</b> set MAK_SIGNING_KEYS as a JSON array of <span class="mono">{ key_id, seed }</span> entries and point MAK_SIGNING_KEY_ID at the new active key. Old public keys remain published at /mak/v1/status.</div></div>
        </div>

        <div class="card">
          ${sectionHead('Administrator password', 'PBKDF2-SHA256. Changing the password signs out other admin sessions.')}
          <form method="post" action="/settings/password">
            ${csrfInput(csrf)}
            <div class="form-grid">
              ${field('Current password', `<input type="password" name="current_password" autocomplete="current-password" required>`, '', 'span-2')}
              ${field('New password', `<input type="password" name="new_password" minlength="10" maxlength="200" autocomplete="new-password" required>`, 'At least 10 characters.')}
              ${field('Confirm new password', `<input type="password" name="confirm_password" minlength="10" maxlength="200" autocomplete="new-password" required>`)}
            </div>
            <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('lock', 15)} Update password</button></div>
          </form>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          ${sectionHead('Posture')}
          <dl class="kv">
            <dt>Server switch</dt><dd>${statusBadge(on ? 'ONLINE' : 'OFFLINE')}</dd>
            <dt>Signing</dt><dd>${signing.ok ? statusBadge('ACTIVE') : statusBadge('SUSPENDED')}</dd>
            <dt>Guest proof</dt><dd>${settings.guest_proof_required ? statusBadge('ACTIVE') : statusBadge('SUSPENDED')}</dd>
            <dt>Admin</dt><dd>${esc(admin.username)} · ${esc(admin.role)}</dd>
            <dt>Panel</dt><dd>${esc(panelName)}</dd>
            <dt>Protocol</dt><dd class="mono">MAK/1</dd>
            <dt>Signed at</dt><dd>${esc(fmtDateTime(Math.floor(Date.now() / 1000)))}</dd>
          </dl>
        </div>

        <div class="card">
          ${sectionHead('Fleet snapshot')}
          <dl class="kv">
            <dt>Licenses</dt><dd>${stats.active || 0} active / ${stats.total || 0}</dd>
            <dt>Devices</dt><dd>${stats.devices || 0}</dd>
            <dt>Guest apps</dt><dd>${stats.guests || 0}</dd>
            <dt>Sessions</dt><dd>${stats.sessions || 0}</dd>
            <dt>Events</dt><dd>${stats.events || 0}</dd>
            <dt>Admins</dt><dd>${stats.admins || 0}</dd>
          </dl>
        </div>

        <div class="card">
          ${sectionHead('Endpoints', 'Public base URL is this Worker origin.')}
          <div class="endpoint"><span class="method">POST</span><code>/mak/v1/challenge</code></div>
          <div class="endpoint"><span class="method">POST</span><code>/mak/v1/authorize</code></div>
          <div class="endpoint"><span class="method">POST</span><code>/mak/v1/guest/check</code></div>
          <div class="endpoint"><span class="method">POST</span><code>/mak/v1/renew</code></div>
          <div class="endpoint"><span class="method">POST</span><code>/mak/v1/heartbeat</code></div>
          <div class="endpoint"><span class="method">POST</span><code>/mak/v1/events</code></div>
          <div class="endpoint"><span class="method">POST</span><code>/mak/v1/revoke</code></div>
          <div class="endpoint"><span class="method">GET</span><code>/mak/v1/status</code></div>
        </div>

        <div class="card">
          ${sectionHead('Danger zone', 'Administrative actions. These are audited.')}
          <form method="post" action="/settings/danger" style="margin-bottom:12px">
            ${csrfInput(csrf)}
            <input type="hidden" name="action" value="revoke_sessions">
            <button class="btn btn-danger" style="width:100%" type="submit" onclick="return askConfirm(this.form,'Revoke every MAK session?','All hosts must authorize again. Licenses and device registrations remain unchanged.','danger')">${icon('ban', 15)} Revoke all sessions</button>
          </form>
          <form method="post" action="/settings/danger">
            ${csrfInput(csrf)}
            <input type="hidden" name="action" value="clear_challenges">
            <button class="btn" style="width:100%" type="submit" onclick="return askConfirm(this.form,'Clear expired challenges?','Only expired or already-consumed challenge rows are removed.','')">${icon('trash', 15)} Clean challenge table</button>
          </form>
          <p class="muted small" style="margin:12px 0 0">Revoking a license is permanent and must be done from its license page.</p>
        </div>

        <div class="card">
          ${sectionHead('Deployment')}
          <div class="notice" style="margin:0">${icon('globe', 17)}<div>Cloudflare Worker + D1. Set secrets with <span class="mono">wrangler secret put</span>; never commit them to the repository.</div></div>
        </div>
      </div>
    </div>`;
}
