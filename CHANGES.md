# CHANGES.md

## Pass 2026-11-24 — self-hosted CSS + icons (CSP-safe UI)

- SDK/MAK pages ab Tailwind aur Bootstrap Icons **Worker ke `/assets/*`** se
  load karte hain. Pehle dono public CDN se aate the, lekin strict CSP
  (`script-src 'self'`, `style-src 'self'`) unhe block kar raha tha — isliye
  Host/Guest/Logs/Settings pages raw HTML jaise dikhte the.
- Tailwind `src/**/*.js` se compile hota hai (`tailwind.config.cjs`), icons
  `vendor/bootstrap-icons/` me vendored hain. Build: `npm run assets:build`.
- Main panel, login/register, aur OpenCode Control layouts bhi local assets
  use karte hain; koi `cdn.tailwindcss.com` / `cdn.jsdelivr.net` reference
  nahi bacha.
- Smoke tests: local asset routes, WOFF2 magic bytes, CSP header, aur "no CDN"
  regression checks. **254 + 31 passing**.

## Pass 2026-11-24 — MAK/2 lifecycle, slot-safe deletes, one green SDK shell

- Numeric duration ab **first successful app bind** par start hota hai:
  `duration_days` issue time par reserve hota hai, `started_at` pehle
  `/activate` par set hota hai, aur `expires_at = started_at + duration`.
  Later binds expiry ko reset/forward nahi karte. Custom-date aur lifetime
  behaviour backward-compatible hai.
- New effective status **NOT YET STARTED** MAK detail, key card, list aur
  expiry labels me dikhta hai.
- Package limit ab **all saved host rows** count karta hai, including
  suspended/blocked. Slot sirf explicit package delete se free hota hai.
  Host delete grants, sessions and host-scoped bindings cascade karta hai.
- App bindings ab hard-delete hoti hain, isliye delete ke baad `max_apps`
  slot turant free hai. Global guest-app delete sab license bindings
  cascade karta hai; security events audit ke liye retain rehte hain.
- Block/suspend/delete actions same filtered `/sdk/hosts` URL par return
  karte hain; alag page redirect nahi hota.
- Guest Apps, Hosts, Devices, Sessions, Security Logs aur license detail ab
  ek hi production glass SDK shell + emerald theme me render hote hain
  (legacy MAK sidebar/theme duplicate removed). `max_installs` UI hidden,
  backend default 3 policy retained.
- Regression tests: duration start/no-reset, suspended-slot accounting,
  cascade deletes, app-slot delete, same-page redirects, legacy durations,
  and shell unification. **270/270 passing**.

## Pass 2026-11-20 — PROFESSOR-only console design

- Naya `GET /professor` route **sirf PROFESSOR role** ke liye. OWNER/ADMIN/
  RESELLER ko `/dashboard` par redirect.
- `src/backend/professor.js`: global aggregates — panels, users, keys, blocked
  keys, role distribution, recent users/keys, tenant-wise users/keys/account
  headroom.
- `src/frontend/panel/professor.js`: dedicated glass console — professor hero,
  KPI grid, tenant network table, role distribution bars, security posture,
  recent users/keys, quick actions.
- Sidebar + command palette me PROFESSOR ko hi **Professor Console** nav item
  dikhta hai.
- Smoke tests: +8 assertions (render, gate, aggregates, script audit).
  **223/223 passing**.

## Pass 2026-11-10 (3) — NexonCheat `/nexon/:panel` encrypted login

- Naya `POST /nexon/:panel` endpoint NexonCheat (com.bgmi) APK ke wire format
  ko samajhta hai: `p1` = base64url(IV12||TAG16||AES-256-GCM), `p2` =
  HMAC-SHA256(p1 text). Response bhi wahi envelope + `.<hex hmac>` hai.
- Request JSON `{k,d,t,pkg}` verify hota hai; `d` uuid format, `t` freshness
  window (`NEXON_MAX_SKEW`, default 24h), `pkg` sirf `com.bgmi`.
- Key lifecycle `/connect` jaisa hi `verifyKey` se: panel active, maintenance,
  blocked, expired, max-device, device bind + `last_seen`.
- Status codes APK ke `Check()` switch se: `q=1` maintenance, `2` expired,
  `3` max device, `4` invalid, `5` wrong app, `6` blocked, `7` success.
  Success payload `x = 0xB7E15163 XOR expiry_epoch` bhejta hai (magic value =
  permanent 2099), plus original-shape decoys `z,w,u,v`.
- `/health` build ab `2026-11-10-nexon`.
- Tests: `test/smoke.mjs` me valid/invalid HMAC, unknown/blocked/expired/
  max-device/wrong-app, maintenance, inactive panel, stale timestamp, device
  binding, OPTIONS/GET aur main-panel bootstrap contract cover hain.

## Pass 2026-11-10 (2) — APK bootstrap key (login without panel UI)

- `/connect/:panel` ab main panel ke liye ek **one-time, marker-gated**
  bootstrap karta hai: agar `api_keys` me `YUVI_001` row nahi hai, to pehla
  `user_key=YUVI_001` request us key ko seed kar deta hai (`30D`,
  `device_limit=1`, `PRIVATE`, pehla device bind hone par).
- Saath me missing `panels` row insert / inactive row reactivate hoti hai,
  aur starter `mod_versions` seed hote hain. Isse purane D1 par bhi APK
  login chalta hai bina admin panel me manually key banane ke.
- Marker `mod_settings.apk_bootstrap_seeded='1'` ensure karta hai ki admin
  key delete/rotate kare to wo dobara auto-create na ho.
- `/health` build ab `2026-11-10-apk-bootstrap`.
- Sirf panel-code key request (`user_key == panel`) par chalta hai; koi
  arbitrary key auto-create nahi hoti.

## Pass 2026-11-10 — One-time auto-activation of legacy pending accounts

- `ensureOpenCodeDB()` me ek baar chalne wali migration: jo purane
  `pending` accounts the (jis time pe approval gate tha), wo ab automatically
  `active` ho jaate hain — marker `opencode_settings.pending_auto_activated='1'`
  ke saath, taaki admin ka baad ka re-lock kabhi undo na ho.
- Naye registrations pehle se hi turant active hain.
- `/health` build ab `2026-11-10-pending-migration`.
- smoke tests: +2 assertions (migration aktivasi, marker-gated re-lock).
  **203/203 passing**.

## Pass 2026-11-09 — Register = instant active (no approval gate)

- Naye registered accounts ab turant `active` hote hain (pehle `pending`
  the — admin approval required). `expires_at` NULL = never expires.
  Global ON/OFF switch aur har admin action (disable/reset/delete/
  pending) waise hi kaam karte hain.
- Purane pending accounts waise hi rahenge — unko ek baar Activate karna
  hoga (/opencode → App accounts).
- smoke test updated (register asserts `active`).

## Pass 2026-11-08 (2) — OpenCode app key: DB auto-seed, no Cloudflare step

- `/api/opencode/*` ko ab koi Cloudflare secret chahiye hi nahi. Key
  resolution (first wins): env `OPENCODE_ENC_KEY` (64 hex) → D1
  `opencode_settings.opencode_enc_key` (64 hex = raw, anything else =
  SHA-256 passphrase) → **auto-seeded default passphrase**
  `YUVISDK88702026BASE64` (connect.js ARCX keys jaisa public-by-design
  idiom). `ensureOpenCodeDB()` har bootstrap me `INSERT OR IGNORE` karta
  hai, to fresh deploy par sab automatically chalta hai.
- `server_key_missing` 503 path hata diya — ye error ab kabhi nahi aata.
- `/opencode/settings` page me ab **active key source** dikhta hai
  (env / D1 custom / auto-seeded default) aur SQL override snippet bhi.
- `/health` build ab `2026-11-08-opencode-dbkey`; schema.sql + docs update.
- Android app ka `.so` same passphrase ke SHA-256 ke saath rebuild karna hota
  hai (dekho `docs/OPENCODE.md` → Wire protocol).
- `test/smoke.mjs`: 3 naye assertions — default key se encrypted
  register/login, raw 64-hex D1 override, env secret precedence.

## Pass 2026-11-08 — OpenCode "Main panel" back navigation + repo hygiene

- `/opencode*` standalone control plane ab main panel par wapas ja sakta
  hai: sidebar footer me full-width **Main panel** link (`/dashboard`) aur
  top bar me compact **Main panel** button — mobile aur desktop dono par.
- Standalone `oc_admin` sessions (SDK cookie ke bina) `/dashboard` se main
  panel login par land hoti hain — dono cases cover.
- `/health` build ab `2026-11-08-opencode-backnav`; `docs/OPENCODE.md`
  updated (routes table + back-nav note).
- Naya `.gitignore`: `node_modules/`, `.wrangler/`, `.dev.vars*`, `*.log`.
- Android app login/register ka asli blocker live Worker me
  `OPENCODE_ENC_KEY` secret missing tha (`server_key_missing`). Repo code
  sahi hai; deployed Worker par secret set karna aur `wrangler deploy`
  chalana zaroori hai — dekho `docs/OPENCODE.md` → Deploy. Verified locally:
  encrypted register/login/status/logout + admin activate → app active.
- `test/smoke.mjs`: +2 assertions (back link rendered for owner + admin
  session). **196/196 passing**.

## Pass 2026-11-06 (2) — /connect classic panel response contract

- `/connect/:panel` ab classic mod-panel response shape deta hai:
  `real, token, modname, mod_status, credit, ESP, Item, AIM, SilentAim,
  BulletTrack, Floating, Memory, Setting, expired_date, EXP, Enc, exdate,
  device, rng` — usi order me. `expired_date`/`EXP`/`exdate` teeno same
  expiry, `Enc` default `List Of Games` (mod_settings `enc_label` se
  override), `device` numeric key limit.
- Purane loader/lib-delivery fields (`server_type`, `version`, `plan`,
  `lib_url`, `lib`, `device_limit`) response me end me retained hain,
  taaki existing clients na tootein. Lowercase `enc` (MD5) bhi retained.
- Default mod identity sample contract jaisi: `Infinite ` / `Safe` /
  `MOD STATUS :- 100% SAFE` (panel Server & Mod page se change ho sakti hai).
- `/api-test` CONNECT response ab pretty-printed JSON dikhata hai
  (HTTP status sirf non-200 par), taaki live output classic panel response
  jaisa dikhe. ENCRYPT preview pehle jaisa.
- `test/smoke.mjs`: +3 assertions (expiry aliases, Enc label, numeric
  device).

## Pass 2026-11-06 — standalone OpenCode control plane

- `/opencode` ab **SDK panel se alag standalone website** hai: apna login page,
  apna `oc_admin` HttpOnly session cookie, apna dark control-plane shell aur
  apni 4 pages (`/opencode`, `/opencode/users`, `/opencode/notices`,
  `/opencode/settings`).
- Naya `src/backend/opencode-admin.js`: password verify (constant-time SHA-256),
  random 32-byte session token, D1 me sirf token hash, 7-day expiry,
  per-IP login rate limit, secret cleanup. Password source priority:
  `OPENCODE_ADMIN_PASSWORD` → `PANEL_ADMIN_PASSWORD` → `OPENCODE_ENC_KEY`.
- Naya `src/frontend/opencode-admin.js`: standalone login page + overview,
  accounts, notices aur settings pages. Global ON/OFF hero toggle, stats,
  remote settings, Gmail account table with activate/extend/reset/revoke/
  pending/disable/delete actions, notice composer/history, security status.
- `applyOpenCodeAdminAction()` me naya `toggle_global` action — settings ko
  wipe kiye bina global switch flip karta hai.
- Router `/opencode/*` routes SDK session gate se **pehle** handle karta hai;
  panel user id 1 owner shortcut ke roop me direct access rakhta hai, baaki
  sab `/opencode/login` par jaate hain. Purana owner-only page hata diya.
- Naya `opencode_admin_sessions` table + index (`schema.sql` me bhi).
- `wrangler.toml` + `docs/OPENCODE.md` + README update; `/health` build
  `2026-11-06-opencode-standalone`.
- `test/smoke.mjs`: standalone login/session, owner bypass, toggle_global,
  notice publish, logout revoke + inline-script audit for all new pages.
  **191/191 passing**.

## Pass 2026-10-19 (5) — backend / frontend restructure

- `src/` ab do saaf hisson me: **backend** (router, DB, APIs, crypto) aur
  **frontend** (sirf HTML render). `src/index.js` ab sirf entry hai jo
  `backend/router.js` export karta hai.
- Naye backend modules: `db.js` (schema+migrations), `http.js`
  (html/redir/cookies/tsMs/deny), `session.js`, `theme.js`,
  `device.js` (deviceFingerprint — pehle p-auth me tha), `mundo.js`,
  `bcore.js` (mundo/bcore handlers pehle router me the).
- Frontend modules: `frontend/ui.js`, `frontend/panel-ui.js`,
  `frontend/auth.js`, `frontend/panel/{dash,users,system}.js`,
  `frontend/sdk/{dash,keys,server}.js` (path/naam `p-*`/`pages-*` se
  clean kiye).
- `wrangler.toml` `main` same (`src/index.js`) — deploy flow unchanged.
- `test/smoke.mjs` import paths update; **151/151 passing** (behaviour
  me koi change nahi — pure restructure).

## Pass 2026-10-18 (4) — tags owner-managed (built-in defaults hataye)

- Tag options ab koi built-in nahi — FREE/PAID/PUBLIC/SAFE/PRIVATE
  defaults hata diye; starter versions bhi ab **tag ke bina** seed hote
  hain (sirf naam).
- Naya `mod_tags` table + Versions tab me **Tags card**: tag add karo,
  chip ke ✕ se remove — remove karne par wo tag sab versions se bhi
  clear ho jata hai.
- Version dropdowns (Mod URL / Add version / row "Set tag") ab sirf
  owner ke add kiye tags dikhate hain; koi option na mile to current
  value hi dikh jata hai.
- `connect` `plan`: tag khaali ho to naam se fallback (PUBLIC/SAFE=FREE,
  baaki=PAID) — behaviour same.
- `test/smoke.mjs`: +2 tests (tag_add, tag_del + version clear, 20
  tables) — **151/151 passing**.

## Pass 2026-10-18 (3) — mod versions: connect DB-driven + Set Mod/Loader 2-tab

- `connect` API ab lib URL **hardcode nahi** karta. Naya `mod_versions`
  table (panel_code, name UNIQUE, tag, url, sort) source of truth hai:
  key ke `server_type` → version name match → PRIVATE → first version.
  `lib_url` / `version_label` / `plan` sab panel ke versions se.
- Har panel owner apne versions add/delete/rename kar sakta hai koi bhi
  naam (PRIVATE / ADMIN / VIP…), aur tag bhi custom (FREE / PAID / SAFE /
  PUBLIC…) — suggested list extend hoti rehti hai.
- Set Mod/Loader page redesign: **Mod Config card hata** (Server page pe
  hai), ab do tabs — "Mod URL" (version select + name/tag/URL edit; yahi
  URL connect bhejta hai) aur "Versions" (add/delete + row me inline
  "Set tag"). Tag ab dropdown hai (FREE / PAID + panel ke baaki tags +
  "＋ Naya tag…" custom add).
- Pehli baar lazily 4 starter versions seed hote hain (naam + tag; URL
  sirf tab jab pehle `loader_files` me save tha — koi hardcoded/legacy
  link nahi) + `mod_settings` marker — owner sab delete kare to wapas
  seed nahi hote. URL khaali ho to connect `lib_url: ''` bhejta hai.
- Generate page ke Server Type pills + Keys page ka server dropdown ab
  panel ke versions se dynamic; `/generate` POST, keys edit aur
  `/api/generate` custom version names accept karte hain.
- `WORKER_VERSION` 1.3.0 → 1.4.0. `test/smoke.mjs`: +8 tests (seeding,
  DB-driven lib_url, label/plan from tag, custom VIP e2e, 19 tables) —
  **148/148 passing**.

## Pass 2026-10-18 (2) — worker-only repo (`web/` removed)

- Standalone Next.js frontend (`web/`, 38 files) removed — repo ab sirf
  **Cloudflare Worker + D1**. HTML panel hi single UI; koi Vercel/Next
  build dependency nahi bachi.
- Alag `vercel-panel` track drop. `FRONTEND_ORIGIN` CORS var generic
  rahega (future me koi bhi cross-origin frontend ke liye kaam aayega).
- Docs/comments se Next.js/Vercel zikr hata ke neutral kar diya.

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

## Web (`web/`, new) — 2026-10-18 ko removed (worker-only repo)

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
