import { authLayout } from '../ui.js';
import { esc } from '../http.js';

export function authPage({ mode = 'login', panelName = 'MUNDO MAK', error = '', ok = '', setupCodeRequired = false, next = '' } = {}) {
  const isSetup = mode === 'setup';
  const body = `
    <form method="post" action="${isSetup ? '/setup' : '/login'}" autocomplete="on">
      ${!isSetup && next ? `<input type="hidden" name="next" value="${esc(next)}">` : ''}
      ${isSetup && setupCodeRequired ? `
      <label class="field"><span class="field-label">Setup code</span>
        <input type="password" name="setup_code" placeholder="Deployment setup code" autocomplete="off" required>
        <span class="field-hint">Required by the Worker environment.</span>
      </label>` : ''}
      <label class="field"><span class="field-label">Username</span>
        <input type="text" name="username" placeholder="admin" autocomplete="username" required maxlength="48" pattern="[A-Za-z0-9_.-]{3,48}">
      </label>
      <label class="field"><span class="field-label">Password</span>
        <input type="password" name="password" placeholder="${isSetup ? 'At least 10 characters' : '••••••••••'}" autocomplete="${isSetup ? 'new-password' : 'current-password'}" required minlength="${isSetup ? 10 : 1}">
      </label>
      ${isSetup ? `
      <label class="field"><span class="field-label">Confirm password</span>
        <input type="password" name="confirm_password" placeholder="Repeat password" autocomplete="new-password" required minlength="10">
      </label>` : ''}
      <button class="btn btn-primary" type="submit">${isSetup ? 'Create administrator' : 'Sign in'} ${isSetup ? '' : ''}</button>
    </form>
    ${isSetup ? `<div class="notice" style="margin-top:16px;margin-bottom:0">Set <b>MAK_SIGNING_KEY</b> as a Worker secret after setup. Until it is configured, activation APIs fail closed.</div>` : ''}
  `;
  return authLayout({
    title: isSetup ? 'First-run setup' : 'Welcome back',
    subtitle: isSetup
      ? 'Create the owner account for this MAK control plane.'
      : 'Sign in to manage licenses, hosts and guest authorization.',
    body,
    panelName,
    ok,
    err: error,
    footer: isSetup ? 'One-time setup' : 'Administrator access',
  });
}
