# FULL Panel — Cloudflare Worker + D1 (panel-glass.zip ka poora port)

`panel-glass.zip` ka **poora panel** — PHP ki jagah **Cloudflare Worker + D1**. Same iOS blue glass UI, mobile responsive.

**Live panel:** <https://panel.itsalihasan75.workers.dev>

## MAK activation (added to this panel)

The existing SDK Panel is unchanged. MAK/1 lives inside it:

- `/mak` — MAK overview, server ON/OFF, recent decisions
- `/mak/licenses` — issue / replay / suspend / rotate / revoke MAKs
- `/mak/guests` — approved guest APKs + per-license operation permissions
- `/mak/hosts` — host package + signing-certificate bindings
- `/mak/devices`, `/mak/sessions`, `/mak/logs` — device/session control and audit trail
- `/mak/settings` — protocol timings, signing identity, password

Public protocol endpoints (no panel login): `/mak/v1/challenge`, `/authorize`,
`/guest/check`, `/renew`, `/heartbeat`, `/events`, `/status`, plus the
admin-only `/revoke`. Every decision is Ed25519-signed; the server fails closed
when the signing key is missing or the global switch is OFF.

Set the signing key once (never commit it):

```bash
npm run keys -- --public
npx wrangler secret put MAK_SIGNING_KEY
# optional:
npx wrangler secret put IP_HASH_SALT
```

The panel/schema updates itself on the first request per isolate; no manual SQL
step is needed after a deploy.

## Pages

- `/login` (device-lock), `/register` (referral), `/reset-device` (24h limit), `/join-panel` (empty panel claim), `/setup` (pehla admin)
- `/dashboard` (role stats), `/professor` (PROFESSOR-only global console:
  tenants, role distribution, recent users/keys, security posture),
  `/generate` (pricing + balance + bulk + server type), `/keys` (reset/edit/extend/bulk)
- `/users`, `/admins`, `/permissions`, `/referral` (OWNER/ADMIN rules PHP jaise)
- `/server` (maintenance + mod config), `/settings` (password + branding + API URLs), `/aes` (AES rotate + activation keys), `/api-test`, `/loader-manager`, `/create-panel` (id==1)
- `/sdk/*` — MUNDO + BCORE dashboard/generate/keys/server/hash (sirf main OWNER id==1)
- `/opencode` — standalone OpenCode Android control plane with its **own login**
  (`/opencode/login`), global APK ON/OFF, Gmail accounts, device lock, notices and
  encrypted `/api/opencode/*` app transport. SDK owner id==1 can also enter directly.
  See [docs/OPENCODE.md](docs/OPENCODE.md).

## API (bina login)

- `POST /connect/:panel` — game=PUBG, user_key, serial
- `POST /encrypt/:panel` — same + AES-256-CBC payload (panel active + AES configured hona chahiye)
- `POST /sdk/mundo/:panel` — AES-128-ECB encrypted
- `POST /sdk/bcore/:panel` — RC4+Base64 encrypted

## Deploy

```bash
cd panel
npm install
npx wrangler deploy
```

Pehli baar site par `/setup` khol ke admin banao. Purane DB par bhi safe hai —
Worker startup par naye columns auto-migrate hote hain **aur MAK tables bhi
automatically create hote hain**. `schema.sql` sirf manual/backup ke liye hai.

MAK activation ke liye ek baar signing key set karo (Cloudflare Dashboard →
Workers & Pages → panel → Settings → Variables and Secrets, ya `wrangler secret
put MAK_SIGNING_KEY`). Seed base64 32-byte hona chahiye:

```bash
npm run keys -- --public
```

Bina key ke panel chalega, lekin `/mak/v1/authorize` fail-closed rahega.

## Note (PHP se farak)

- `loader-manager` (Set Mod/Loader) me **versions** hain — har version ka name + tag (FREE/PAID/SAFE…) + lib URL; `connect` API har key ke server type ka URL **sirf isi panel config se** bhejta hai (koi hardcoded fallback nahi). Pehli baar 4 starter versions seed hote hain (sirf naam — tag aur URL khud set karo; koi fixed link / default tag nahi). Tags Versions tab ke **Tags** card se add/remove hote hain. Zip upload nahi (Worker me disk nahi hota) — direct `.zip` link do.
- CSRF check nahi hai, Turnstile nahi hai (PHP login me bhi verify nahi tha).
- `/blocked` route nahi hai (zip me uska file tha hi nahi).
- `/sdk/api-test`, `/sdk/encryption`, `/sdk/settings` nahi hain (zip me unke file missing hain).

## Files (backend / frontend structure)

```
src/
├── index.js                 # entry — sirf router export
├── backend/                 # saara logic, DB, APIs
│   ├── router.js            # saare routes + POST actions
│   ├── db.js                # schema + migrations (ensureDB)
│   ├── http.js              # html/redir/cookies/formParams/tsMs/deny
│   ├── session.js           # sdk_session lookup + cookie helpers
│   ├── theme.js             # ui_theme / accent / panel name
│   ├── device.js            # device fingerprint (login + /api lock)
│   ├── crypto.js            # RC4/BCORE/AES/MD5/hashPassword
│   ├── security.js          # rate-limit + session cookie build
│   ├── professor.js         # PROFESSOR console data (global aggregates)
│   ├── api.js               # /api/* JSON endpoints
│   ├── connect.js           # /connect + /encrypt (app-facing)
│   ├── mundo.js             # /sdk/mundo/* validation
│   ├── bcore.js             # /sdk/bcore/* validation
│   ├── opencode.js          # encrypted OpenCode app API + admin actions
│   └── opencode-admin.js    # standalone admin password/session auth
├── mak/                     # MAK/1 activation (mounted at /mak + /mak/v1)
│   ├── protocol.js          # challenge/authorize/guest-check/renew/heartbeat
│   ├── admin.js             # MAK pages, using the existing sdk_session login
│   ├── store.js             # D1 queries for licenses/devices/sessions/events
│   ├── crypto.js            # Ed25519, ECDSA P-256, MAK + canonical JSON
│   ├── schema.js            # mak_* tables (also appended to schema.sql)
│   ├── settings.js          # runtime kill switch + protocol timings
│   └── ui.js, pages/        # MAK admin rendering
└── frontend/                # sirf HTML render (koi DB/logic nahi)
    ├── ui.js                # shared kit: CSS, esc, MODE_*, palette
    ├── panel-ui.js          # panel chrome + role nav
    ├── auth.js              # login/register/reset/join pages
    ├── opencode-admin.js    # standalone OpenCode login + control plane
    ├── panel/               # panel (admin) pages
    │   ├── dash.js          #   dashboard/generate/key-list
    │   ├── users.js         #   users/admins/permissions/referral
    │   ├── professor.js     #   PROFESSOR-only global console
    │   └── system.js        #   server/settings/aes/api-test/loader
    └── sdk/                 # SDK user pages
        ├── dash.js          #   dashboard/generate
        ├── keys.js          #   key manager
        └── server.js        #   server + hash vault
```

D1 binding (`wrangler.toml` me set):
```toml
[[d1_databases]]
binding = "DB"
database_name = "panel"
database_id = "543f2e0c-e536-46f4-92c6-d8e32b8524e1"
```
