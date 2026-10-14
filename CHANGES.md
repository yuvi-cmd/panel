# CHANGES.md — this pass (2026-10-14)

## Worker (`worker/`)

- Added `src/security.js`: roles (`PROFESSOR`>OWNER>ADMIN>RESELLER),
  per-isolate login throttling, IST display helper, `Secure` cookie helper,
  `FRONTEND_ORIGIN` CORS helper, panel-code validation.
- Added `src/api.js`: typed JSON API (`/api/health|login|logout|me|
  dashboard|pricing|keys|generate|users|referral|server|settings/password|
  aes-status|activate|anticrack|panels`) reusing the same tables and
  tenant scoping as the HTML panel. `/connect/*`, `/encrypt/*`, `/sdk/*`
  contracts byte-identical.
- `src/index.js`: `/api/*` routing (+OPTIONS); `ensureDB` once per isolate;
  `Secure` cookies; HTML-login throttling; device-lock error without raw HTML;
  `/register` role coercion; `/referral` no OWNER minting; `/users`
  ReferenceError removed + PROFESSOR guards; owner-like gates unified;
  AES/activation/panel/SDK gates admit PROFESSOR; BCORE no longer auto-creates
  panels; MUNDO/BCORE use env-overridable secrets.
- `src/crypto.js`: `BCORE_SECRET`/`MUNDO_SALT` kept as legacy fallbacks with
  `bcoreSecretFromEnv()`/`mundoSaltFromEnv()` overrides; encrypt/decrypt take
  optional secrets.
- `src/p-connect.js`: `ARCX_TOKEN_SALT` override; DB errors logged
  server-side, generic client message.
- `src/p-auth.js`: error text escaped; reset link allowlisted.
- `src/ui.js`: `esc()` also escapes `'`; new `jsArg()` helper.
- `src/p-users.js`: referral form no longer offers OWNER.
- `wrangler.toml`: `FRONTEND_ORIGIN` var + secret instructions (no values).
- `package.json`: `"type": "module"`, `version 1.1.0`, `npm test`.
- New `test/smoke.mjs`: 39 integration tests (node:sqlite, zero deps) —
  **39/39 passing** on Node 26.

## Web (`web/`, new)

- Next.js 14.2.35 + React 18 + TS + Tailwind 3 + lucide-react. Light SaaS
  theme (white sidebar/header, `#F8FAFC` bg, `#4F46E5` accent, Inter).
- Typed `lib/api.ts` client (cookie session, `credentials: include`), auth
  context, IST formatting, device fingerprint on login.
- Reusable `components/ui.tsx` (Button/Card/Input/Label/Select/Badge/
  Skeleton/Switch/Tabs/Dialog/ConfirmDialog/DropdownMenu/Sheet/Toast) and
  `components/dashboard.tsx` (PageHeader/StatCard/StatusBadge/DataTable/
  EmptyState); role-aware layout with mobile drawer.
- Pages: login/register/join-panel/reset-device, dashboard, keys (search,
  filter, pagination, bulk select, guarded actions), users, generate,
  server, api-test (PUBG default + response viewer), enc-api (no secrets in
  client), Anticrack (supported features only), panel-activate, referral,
  tenant (super-admin), profile, settings.
- `tsc --noEmit` clean. `next build` on this Android device is blocked by a
  missing `@next/swc-android-arm64` prebuild (Next.js stopped publishing it
  after 13.2.x) — build on Vercel/CI/Linux with no code changes.
