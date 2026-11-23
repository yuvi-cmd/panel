# FULL Panel — Cloudflare Worker + D1 (panel-glass.zip ka poora port)

`panel-glass.zip` ka **poora panel** — PHP ki jagah **Cloudflare Worker + D1**. Same iOS blue glass UI, mobile responsive.

**Live panel:** <https://panel.itsalihasan75.workers.dev>

## MAK/2 activation (added to this panel)

MAK/2 is the only public protocol. `/mak/v1/*` is deliberately removed and
returns `410 PROTOCOL_REMOVED`. Every MAK management screen lives under `/sdk`:

- `/sdk` — MAK overview, server ON/OFF, recent decisions
- `/sdk/generate` — issue a new MAK (custom key, package/app limits, duration, signature bind)
- `/sdk/keys` — list MAKs; suspend / rotate / revoke / bind hosts and guests
- `/sdk/guests` — approved guest APKs + per-license operation permissions
- `/sdk/hosts` — host package + signing-certificate bindings
- `/sdk/devices`, `/sdk/sessions`, `/sdk/logs` — legacy records and audit trail
- `/sdk/settings` — signing identity, legacy timings, password
- `/sdk/server` — kill switch + live MAK/2 endpoints
- `/sdk/hash` — universal lib hash vault

Legacy `/mak` and `/mak/licenses` URLs redirect into `/sdk`; there is no second
MAK console any more.

Public protocol endpoints (no panel login):

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/mak/v2/status` | Public signing + envelope key status |
| `POST` | `/mak/v2/activate` | Encrypted MAK + host identity → signed grant |
| `POST` | `/mak/v2/host/verify` | Strict-online host gate → short-lived HostTicket |
| `POST` | `/mak/v2/guest/check` | Signed Launch/Install/Update/Restart ticket |
| `POST` | `/mak/v2/status` | Signed grant status / revocation check |
| `POST` | `/mak/v2/deactivate` | Revoke the current host grant |

Requests and responses use a NaCl box envelope (X25519 + XSalsa20-Poly1305,
HKDF-SHA256) inside TLS 1.3. Grants and every ticket are Ed25519-signed; the
server fails closed when a key is missing or the global switch is OFF.

No key is hardcoded and no Worker secret has to be pasted. After deploying,
open **`/sdk/server`** and press **Generate MAK/2 keys**. The panel creates an
Ed25519 signing key + an X25519 envelope key, stores them in D1 and publishes
only the public halves at `GET /mak/v2/status`.

Later rotations are signed by the previous key, so existing AAR installs accept
the new keys automatically — no rebuild. The AAR does not ship a server public
key; it pins the active key on first contact and verifies every rotation.

See [docs/MAK-DEPLOY.md](docs/MAK-DEPLOY.md) for the deploy + rotation +
verification flow.

The panel/schema updates itself on the first request per isolate; no manual SQL
step is needed after a deploy.

## Pages

- `/login` (device-lock), `/register` (referral), `/reset-device` (24h limit), `/join-panel` (empty panel claim), `/setup` (pehla admin)
- `/dashboard` (role stats), `/professor` (PROFESSOR-only global console:
  tenants, role distribution, recent users/keys, security posture),
  `/generate` (pricing + balance + bulk + server type), `/keys` (reset/edit/extend/bulk)
- `/users`, `/admins`, `/permissions`, `/referral` (OWNER/ADMIN rules PHP jaise)
- `/server` (maintenance + mod config), `/settings` (password + branding + API URLs), `/aes` (AES rotate + activation keys), `/api-test`, `/loader-manager`, `/create-panel` (id==1)
- `/sdk/*` — full MAK dashboard, generation, license management, guests,
  devices, sessions, logs, settings, server and hash vault
  (sirf main OWNER id==1 / PROFESSOR). BCORE/MUNDO flow removed.
- `/opencode` — standalone OpenCode Android control plane with its **own login**
  (`/opencode/login`), global APK ON/OFF, Gmail accounts, device lock, notices and
  encrypted `/api/opencode/*` app transport. SDK owner id==1 can also enter directly.
  See [docs/OPENCODE.md](docs/OPENCODE.md).

## API (bina login)

- `POST /connect/:panel` — game=PUBG, user_key, serial
- `POST /encrypt/:panel` — same + AES-256-CBC payload (panel active + AES configured hona chahiye)
- `POST /mak/v2/activate`, `/host/verify`, `/guest/check`, `/status`, `/deactivate` — MAK/2 encrypted envelope
- `GET /mak/v2/status` — public signing + envelope key status
- `/mak/v1/*` — removed, always `410 PROTOCOL_REMOVED`
- C++/Android host integration (old `/sdk/mundo` + `/sdk/bcore` endpoints retired):
  [docs/CPP-INTEGRATION.md](docs/CPP-INTEGRATION.md)

## Deploy

```bash
cd panel
npm install
npx wrangler deploy
```

Pehli baar site par `/setup` khol ke admin banao. Purane DB par bhi safe hai —
Worker startup par naye columns auto-migrate hote hain **aur MAK tables bhi
automatically create hote hain**. `schema.sql` sirf manual/backup ke liye hai.

MAK/2 keys panel ke andar se generate hoti hain. Deploy ke baad
**`/sdk/server`** kholo aur **Generate MAK/2 keys** dabao. Panel Ed25519
signing key + X25519 envelope key banata hai, dono D1 me rakhta hai, aur sirf
public halves `/mak/v2/status` par publish karta hai.

Koi key APK me hardcoded nahi hai aur koi Worker secret paste nahi karna.
Rotation bhi panel se hota hai; purani Ed25519 key nayi key ko sign karti hai,
isliye installed AAR automatically nayi keys par chala jaata hai.

Deploy aur verification: [docs/MAK-DEPLOY.md](docs/MAK-DEPLOY.md).

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
│   ├── crypto.js            # AES/MD5/hashPassword + legacy helpers
│   ├── security.js          # rate-limit + session cookie build
│   ├── professor.js         # PROFESSOR console data (global aggregates)
│   ├── api.js               # /api/* JSON endpoints
│   ├── connect.js           # /connect + /encrypt (app-facing)
│   ├── opencode.js          # encrypted OpenCode app API + admin actions
│   └── opencode-admin.js    # standalone admin password/session auth
├── mak/                     # MAK/2 activation (mounted at /mak/v2, admin at /sdk)
│   ├── protocol-v2.js       # encrypted activate/host/guest/status/deactivate
│   ├── secure.js            # NaCl box envelope + response signing
│   ├── keystore.js          # panel-generated D1 keyring + rotation chain
│   ├── admin.js             # MAK pages, using the existing sdk_session login
│   ├── store.js             # D1 queries for licenses/devices/sessions/events
│   ├── crypto.js            # Ed25519, ECDSA P-256, MAK + canonical JSON
│   ├── schema.js            # mak_* tables (also appended to schema.sql)
│   ├── issue.js             # shared MAK validation + issuance (SDK + MAK admin)
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
