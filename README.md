# FULL Panel — Cloudflare Worker + D1 (panel-glass.zip ka poora port)

`panel-glass.zip` ka **poora panel** — PHP ki jagah **Cloudflare Worker + D1**. Same iOS blue glass UI, mobile responsive.

## Pages

- `/login` (device-lock), `/register` (referral), `/reset-device` (24h limit), `/join-panel` (empty panel claim), `/setup` (pehla admin)
- `/dashboard` (role stats), `/generate` (pricing + balance + bulk + server type), `/keys` (reset/edit/extend/bulk)
- `/users`, `/admins`, `/permissions`, `/referral` (OWNER/ADMIN rules PHP jaise)
- `/server` (maintenance + mod config), `/settings` (password + branding + API URLs), `/aes` (AES rotate + activation keys), `/api-test`, `/loader-manager`, `/create-panel` (id==1)
- `/sdk/*` — MUNDO + BCORE dashboard/generate/keys/server/hash (sirf main OWNER id==1)
- `/opencode` — standalone OpenCode Android control plane with its **own login**
  (`/opencode/login`), global APK ON/OFF, Gmail accounts, device lock, notices and
  encrypted `/api/opencode/*` app transport. SDK owner id==1 can also enter directly.
  See [docs/OPENCODE.md](docs/OPENCODE.md).

## API (bina login)

- `POST /connect/:panel` — game=PUBG, user_key, serial
- `POST /nexon/:panel` — NexonCheat (com.bgmi) encrypted login; same key/device
  lifecycle as `/connect`, response is AES-256-GCM + HMAC envelope
- `POST /encrypt/:panel` — same + AES-256-CBC payload (panel active + AES configured hona chahiye)
- `POST /sdk/mundo/:panel` — AES-128-ECB encrypted
- `POST /sdk/bcore/:panel` — RC4+Base64 encrypted

### `/nexon/:panel` protocol

NexonCheat APK `libshaitaan.so` ka wire format:

```
request : p1=<b64url(IV12||TAG16||AES-256-GCM(json))>&p2=<hex HMAC-SHA256(p1)>
json    : {"k":"<key>","d":"<device-uuid>","t":<epoch>,"pkg":"com.bgmi"}
response: <b64url(IV12||TAG16||AES-256-GCM(json))>.<hex HMAC-SHA256(p1)>
```

Response JSON `q` = `1` maintenance, `2` expired, `3` max device, `4` invalid,
`5` wrong app, `6` blocked, `7` success. Success me `x` = `0xB7E15163 XOR
expiry_epoch`; `x == 0xB7E15163` permanent (2099) hai. Sab outcomes HTTP 200
par encrypted aate hain. AES/HMAC constants `libshaitaan.so` me embedded hain;
`NEXON_AES_KEY` / `NEXON_HMAC_KEY` env se override ho sakte hain, aur
`NEXON_MAX_SKEW` (default 86400 sec, `0` = off) request timestamp window hai.

## Deploy

```bash
cd sdk-worker
npm install
npx wrangler d1 execute sdk --file=schema.sql
npx wrangler deploy
```

Pehli baar site par `/setup` khol ke admin banao. Purane DB par bhi safe hai — Worker startup par naye columns auto-migrate hote hain.

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
│   ├── api.js               # /api/* JSON endpoints
│   ├── connect.js           # /connect + /encrypt (app-facing)
│   ├── nexon.js             # /nexon/* NexonCheat encrypted login
│   ├── mundo.js             # /sdk/mundo/* validation
│   ├── bcore.js             # /sdk/bcore/* validation
│   ├── opencode.js          # encrypted OpenCode app API + admin actions
│   └── opencode-admin.js    # standalone admin password/session auth
└── frontend/                # sirf HTML render (koi DB/logic nahi)
    ├── ui.js                # shared kit: CSS, esc, MODE_*, palette
    ├── panel-ui.js          # panel chrome + role nav
    ├── auth.js              # login/register/reset/join pages
    ├── opencode-admin.js    # standalone OpenCode login + control plane
    ├── panel/               # panel (admin) pages
    │   ├── dash.js          #   dashboard/generate/key-list
    │   ├── users.js         #   users/admins/permissions/referral
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
