# OpenCode Android control panel

This is the server side of the OpenCode Android activation system. It lives in
the existing Worker/D1 panel, but uses its own tables and is visible only to
panel user `id === 1` (the owner). It does not reuse the SDK/MUNDO/BCORE tables.

## What it does

- Registers app accounts with an `@gmail.com` address only.
- Hashes passwords with PBKDF2-SHA256 (100,000 rounds, random salt).
- Issues opaque session tokens; only SHA-256 hashes are stored in D1.
- Binds each account to one app-generated device id.
- Lets the owner activate, extend, disable, delete, and reset devices.
- Global ON/OFF switch plus per-user activation.
- Push notices (latest active notice is shown in the app).
- Shows registered/active/pending/disabled/seen-in-last-24h counts.

## Files

- `src/backend/opencode.js` — encrypted app API, schema, admin queries/actions.
- `src/frontend/panel/opencode.js` — owner-only `/opencode` page.
- `router.js` — API dispatch, `id === 1` gate, `/opencode` page.
- `panel-ui.js` — owner-only nav item.
- `schema.sql` — optional bootstrap tables (the backend also auto-creates them).
- `wrangler.toml` — secret setup note.

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

# SECRET: read the value from OpenCodeAndroid/.panel-secret, then paste it when
# wrangler prompts. Never put the key in wrangler.toml, git, or chat logs.
wrangler secret put OPENCODE_ENC_KEY

wrangler deploy
```

`/health` should still return 200. A missing/invalid `OPENCODE_ENC_KEY` makes
`/api/opencode/*` return `server_key_missing`; fix the secret before shipping.

## Owner use

1. Login to the panel as user id `1`.
2. Open **OpenCode App** in the sidebar.
3. Use **Remote Control** for the global switch and maintenance message.
4. Activate a pending account with the days field; status becomes active.
5. Publish notices; the newest active notice appears on the app lock/chat UI.

Panel user id 1 is the only account allowed to see this page. The nav link is
also hidden for everyone else; `/opencode` returns 403 for other users.

## Apps / security notes

- Account creation is Gmail-only by server validation, but it is not email
  verification. Someone can enter a Gmail address they do not own.
- Device binding prevents casual sharing; it is not tamper-proof. A modified
  APK can bypass client checks. Keep server-side gates authoritative.
- The AES key is embedded in the APK's native library for request encryption.
  Extraction is possible for a determined attacker; obfuscation is not a
  substitute for TLS or server-side authorization.
- Rate limits are in-memory per Worker isolate. Add D1-backed limits if abuse
  becomes a problem.
