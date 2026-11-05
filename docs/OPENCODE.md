# OpenCode Android control panel

This is the server side of the OpenCode Android activation system. It lives in
the existing Worker/D1 deployment, but it is a **standalone control plane**:
its own tables, its own login page, its own session cookie and its own UI. It
does not reuse the SDK/MUNDO/BCORE tables or the SDK login session.

## Live deployment

- Panel: <https://panel.imranfarhat255.workers.dev>
- Standalone control plane: <https://panel.imranfarhat255.workers.dev/opencode>
- Standalone admin login: <https://panel.imranfarhat255.workers.dev/opencode/login>
- Health: <https://panel.imranfarhat255.workers.dev/health>

The Worker is deployed with build `2026-11-06-opencode-standalone`. If
`/api/opencode/*` returns `code: "server_key_missing"`, set `OPENCODE_ENC_KEY`
(see **Deploy** below) and redeploy. The app uses the same 64-hex key from
`OpenCodeAndroid/.panel-secret`.

## Pages and routes

| Route | What it is |
|---|---|
| `GET/POST /opencode/login` | Standalone admin login (password only) |
| `GET /opencode/logout` | Destroys the standalone admin session |
| `GET /opencode` | Overview: global switch, stats, remote settings, recent accounts, notices |
| `GET /opencode/users` | Full app-account list, search and per-user actions |
| `GET /opencode/notices` | Publish, pause, delete in-app notices |
| `GET /opencode/settings` | Remote config, security status and API reference |
| `POST /api/opencode/{register,login,status,logout}` | Encrypted Android app API (unchanged) |

The admin pages accept **either** a standalone `oc_admin` cookie **or** an SDK
session for panel user `id === 1`. That owner shortcut means the existing main
panel link keeps working without a second login. Everyone else is redirected to
`/opencode/login`. There is no owner-only `id === 1` gate inside the standalone
surface itself.

## Admin authentication

Set a Cloudflare Worker secret. The first configured value wins:

1. `OPENCODE_ADMIN_PASSWORD` (recommended)
2. `PANEL_ADMIN_PASSWORD`
3. `OPENCODE_ENC_KEY` (fallback; works with the app encryption key)

The password is verified in constant time against a SHA-256 digest. A correct
password creates a random 32-byte token; only its SHA-256 hash is stored in
`opencode_admin_sessions`. The browser receives an `HttpOnly`, `SameSite=Lax`
cookie named `oc_admin` with a 7-day expiry (plus `Secure` on HTTPS). Login is
rate-limited per IP (8 attempts/minute, best-effort per isolate).

If no admin password is configured, `/opencode/login` shows setup instructions
instead of the form. The owner can still enter through the main SDK panel.

## What the panel does

- Registers app accounts with an `@gmail.com` address only.
- Hashes passwords with PBKDF2-SHA256 (100,000 rounds, random salt).
- Issues opaque app session tokens; only SHA-256 hashes are stored in D1.
- Binds each account to one app-generated device id.
- Activates, extends, disables, deletes and resets devices per account.
- Global APK ON/OFF switch with a maintenance message and support URL.
- Minimum app version gate.
- Pushes notices; the latest active notice is shown in the app.
- Shows registered/active/pending/disabled/seen-in-last-24h counts.

## Files

- `src/backend/opencode.js` — encrypted app API, schema, admin queries/actions.
- `src/backend/opencode-admin.js` — standalone admin password/session auth.
- `src/frontend/opencode-admin.js` — standalone login + dashboard UI.
- `src/backend/router.js` — dispatches `/opencode/*` before the SDK gate.
- `src/frontend/panel-ui.js` — owner shortcut in the SDK sidebar.
- `schema.sql` — optional bootstrap tables (backend auto-creates them too).
- `wrangler.toml` — secret setup notes.

## Wire protocol

All app requests are `POST /api/opencode/{register,login,status,logout}` with a
JSON envelope:

```json
{"v":1,"n":"<base64 12-byte nonce>","d":"<base64 AES-256-GCM ciphertext>"}
```

The plaintext payload contains `ts`, `device_id`, `device_name`, and
`email`/`password` or `token`. Responses use the same envelope. The key is a
Cloudflare Worker secret named `OPENCODE_ENC_KEY` (exactly 64 hex chars = 32
bytes); the Android app receives the same key from its native `.so`. AAD is the
ASCII string `opencode:v1`. TLS is still required.

The app's native URL is embedded in `libopencode_boot.so`. The Worker URL in
this repo's app counterpart is `https://panel.imranfarhat255.workers.dev`.

## Deploy

```bash
cd panel

# One time (or rely on the API's auto-create):
wrangler d1 execute panel --remote --file=schema.sql

# SECRETS: read OPENCODE_ENC_KEY from OpenCodeAndroid/.panel-secret, then paste
# it when wrangler prompts. Choose a separate admin password.
# Never put secrets in wrangler.toml, git, or chat logs.
wrangler secret put OPENCODE_ENC_KEY
wrangler secret put OPENCODE_ADMIN_PASSWORD

wrangler deploy
```

`/health` should return 200 with build `2026-11-06-opencode-standalone`. A
missing/invalid `OPENCODE_ENC_KEY` makes `/api/opencode/*` return
`server_key_missing`; fix the secret before shipping.

## Admin use

1. Open `/opencode/login` and enter the admin password.
   Or: login to the main SDK panel as user id `1`, then open
   **OpenCode Control** in the sidebar.
2. Use the overview global switch to pause/resume every app install.
3. Open **App accounts** to search registrations, activate a pending account
   for N days, extend from expiry, reset a device, revoke sessions, disable or
   delete.
4. Open **Notices** to publish the message shown inside the app.
5. Open **Settings** for the support URL, minimum version code and maintenance
   message. The page also reports whether the Worker secrets are configured.

## Security notes

- Account creation is Gmail-only by server validation, but it is not email
  verification. Someone can enter a Gmail address they do not own.
- Device binding prevents casual sharing; it is not tamper-proof. A modified
  APK can bypass client checks. Keep server-side gates authoritative.
- The AES key is embedded in the APK's native library for request encryption.
  Extraction is possible for a determined attacker; obfuscation is not a
  substitute for TLS or server-side authorization.
- Admin sessions are independent from the SDK panel and can be revoked by
  deleting `opencode_admin_sessions` rows or by rotating the admin secret (the
  token hash stays valid until expiry, so delete rows for immediate logout).
- Rate limits are in-memory per Worker isolate. Add D1-backed limits if abuse
  becomes a problem.
