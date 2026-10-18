# CHANGES.md

## Pass 2026-10-18 — single PROFESSOR + referral roles & admin quota

- Single main owner: `/setup` now creates id 1 with role `PROFESSOR`
  (top of PROFESSOR > OWNER > ADMIN > RESELLER). Existing installs are
  migrated in place during `ensureDB` (`id=1 AND role='OWNER'` →
  `PROFESSOR`, idempotent). PROFESSOR can never be minted via referral.
- Claim/role-dependent lookups now recognise PROFESSOR: panel re-claim
  guard (`/join-panel`), SDK gate (id 1), panel-expiry lookup
  (`/connect|/encrypt`), generate-page owner copy, nav SDK link.
- Referral roles: owner/professor can mint `OWNER`, `ADMIN` and
  `RESELLER` codes; Admin only `RESELLER`. `/register` honours
  OWNER/ADMIN roles only when the code's minter is OWNER/PROFESSOR —
  admin-minted & legacy codes still coerce to RESELLER.
- `/referral`: Owner panel — "Admin Reseller Quota" section (per-Admin
  toggle + limit stepper, 0 = ∞); Admin panel — quota banner
  (`used/limit`, ON/OFF) and generation blocked with reason once the
  owner-set limit is reached or referrals are turned off.
- `WORKER_VERSION` 1.2.0 → 1.3.0. `test/smoke.mjs`: +8 tests (PROFESSOR
  setup/migration, OWNER referral minting, admin coercion, quota
  enforcement) — **140/140 passing** on Node 26.
- UI pass (fit/overlap): referral generate form mobile par 1-column
  stack (Role / Duration / Balance), Balance bhi stepper; steppers ka
  global polish — 36px buttons, hover/active states, native number
  spinners off; permission quota + create-panel + aes rows wrap karte
  hain bina squeeze ke.
- Stepper redesign (har page): ab ek hi integrated input-group —
  `−`/`+` buttons input ke border ke andar, beech me centered value,
  focus par accent ring, hover highlight; unit labels (days, acct
  limit, month(s)) stepper ke bahar; sab jagah same look — Generate
  page, Tenants, AES/Activation, Loader, Referrals, Permissions.

## Pass 2026-10-17 — tenant account limits + auto join / default lock

- `panels.account_limit` (0 = unlimited): set while creating a tenant or
  change later with the stepper on the Tenants page — persisted in D1.
- Claiming a panel (`/join-panel`) defaults it to exactly 1 account (the
  owner); a pre-set limit is respected. Admin raises it with the stepper.
- `panels.auto_join`: "Set default" on any tenant → `/join-panel` shows
  that code pre-filled AND read-only (locked). "Remove default" unlocks.
- Enforcement: `/join-panel` claims and `/register` (referral) are
  rejected once a tenant reaches its account limit; a second claim of an
  owned panel is blocked (one owner per panel).
- `/create-panel`: new `set_limit` + `auto_join` actions; create form
  accepts `account_limit`; cards show used/limit, remaining, AUTO badge.
- `schema.sql` + `ensureDB` migration add both columns to existing DBs.
- `test/smoke.mjs`: +20 tests — **132/132 passing** on Node 26.

## Pass 2026-10-14 — full panel hardening + web port

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
