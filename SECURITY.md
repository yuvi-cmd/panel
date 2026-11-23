# SECURITY.md — audit findings for ARC Auth (this pass)

Status: findings below are **fixed and covered by `worker/test/smoke.mjs`
(39 tests)** unless marked OPEN. Nothing here is a claim of a completed
security audit. Re-test before production.

## Fixed (with tests)

1. **`ReferenceError: allowed` crashed every `/users` POST** (`worker/src/index.js`).
   A leftover `if (allowed === false …)` referenced an undeclared variable, so
   all balance/block actions returned 500. Removed; role checks kept.
   Test: `toggle_block works (no ReferenceError)`.
2. **Referral privilege escalation.** OWNER could mint `OWNER` referrals
   (HTML select + API), and `/register` honored any stored role — a leaked
   code could create a panel OWNER. Now: generation coerces to
   ADMIN/RESELLER, registration coerces legacy OWNER codes to ADMIN.
   Tests: `OWNER referral coerced`, `legacy OWNER referral coerced`.
3. **BCORE/MUNDO removed.** The legacy `/sdk/bcore/*` and `/sdk/mundo/*`
   activation endpoints and their admin pages are gone; `/sdk` now issues
   MAK/1 licenses. Tests assert both legacy endpoints return 404.
4. **Reflected-XSS surface.** `alerts()` injected `error` unescaped (the
   device-lock message carried raw HTML), and `esc()` ignored single quotes,
   so `custom_key` values could break `onclick="doCopy('…')"` handlers.
   Now: `esc()` covers `'`, error text is escaped, the reset link is a static
   allowlisted constant. Test: `esc() escapes quotes + tags`.
5. **DB error text leaked to clients.** `errDetail()` appended exception
   messages for logged-in users (`SERVER ERROR :: …`). Now: generic message
   + server-side `console.error`. (No test asserts message text; verified by
   code inspection — errors return `SERVER ERROR`.)
6. **Schema migration on every request.** `ensureDB()` ran full `SCHEMA` +
   ~19 `ALTER TABLE`s per request (D1 cost/latency). Now: once per isolate
   (`globalThis.__arcDbReady`). Fresh deploys still migrate on cold start.
7. **Missing `Secure` cookie flag.** Session cookie now adds `Secure` on
   `https://` (kept `HttpOnly`, `SameSite=Lax`). No CSRF tokens yet — see OPEN.
8. **Role hierarchy.** Added `PROFESSOR` (rank 4 > OWNER 3 > ADMIN 2 >
   RESELLER 1): owner-like panel powers + SDK/panel-management access;
   non-professors cannot mutate PROFESSOR accounts. Tenant data stays scoped
   to the session's `panel_code` (Professor global reads only via explicit,
   validated `?panel=` on the dashboard API).
9. **Balance TOCTOU tightened (API).** `/api/generate` uses atomic
   `UPDATE … WHERE balance>=?` and checks `meta.changes`. (HTML route keeps
   its check-then-update; the guarded UPDATE is the enforcement.)

## Deliberately NOT changed (compat)

- **Legacy RC4/BCORE, AES-128-ECB/MUNDO helpers, MD5 tokens, single-round
  SHA-256(salt+password), `Vm8Lk7…` token salt.** These are client-visible
  protocols: rotating them breaks installed clients. Hardcoded values are now
  documented **legacy fallbacks** overridable without redeploy via encrypted
  secrets (`BCORE_SECRET`, `MUNDO_SALT`, `ARCX_TOKEN_SALT`); `SECURITY.md`
  migration plan:
  1. Ship dual-verify (accept old + new) for one client release cycle.
  2. Migrate password hashes to PBKDF2/scrypt/bcrypt on next login
     (rehash-and-upgrade column), keeping SHA-256 verify as fallback.
  3. Replace ECB with an authenticated mode and MD5 tokens with CSPRNG
     tokens behind a versioned endpoint (`/v1/…`), keeping old routes until
     clients migrate. Never rotate silently.
- **`/encrypt` timestamps** stay `YYYY-MM-DD HH:MM:SS` UTC (native clients
  parse them). IST conversion is display-only (`formatIST`, `_ist` fields).
- **Activation vouchers are intentionally global** (main owner sells time to
  other panels); single-use + `used_by` recorded. Documented, not a leak.

## OPEN (do before production)

- [ ] No CSRF tokens on HTML form POSTs; no Turnstile/rate-limit infra beyond
      best-effort per-isolate throttling (`hitRate`) on login. Enable
      Cloudflare Rate Limiting + WAF on `/login`, `/register`, `/connect/*`.
- [ ] Password hashing is still fast SHA-256 (see migration plan above).
- [ ] `activation_keys.recent` global list visible to super-admin by design.
- [ ] `wrangler.toml` `database_id` must be replaced with your D1 id (the old
      README quoted a different id — fixed to the file's value; verify).
- [ ] The `id === 1` super-admin concept predates multi-tenancy; Professor is
      the forward path. Audit any `id === 1` assumptions before onboarding.
- [ ] **Rotate any secret/token pasted into chat or logs** (including the
      GitHub PAT shared during this task — it must be revoked in GitHub
      settings; it was never written to the repo).
