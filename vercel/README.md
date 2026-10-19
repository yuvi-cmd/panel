# Vercel deploy — same panel, DB on Cloudflare D1

Worker ke bina bhi yeh panel Vercel par chal sakta hai. UI, routes, APIs sab
**same code** (`src/backend` + `src/frontend`) — bas DB native D1 binding ki
jagah **D1 REST API** se aata hai (`src/backend/d1-rest.js`). D1 wahi rehta
hai, data dono taraf **common** — Worker aur Vercel dono ek hi DB use karte
hain.

## Kya chahiye

- Cloudflare account (D1 database pehle se banao — wahi jo Worker use karta hai)
- Cloudflare API token: **Account → API Tokens → Create Token → Custom**
  - Permission: **D1 → Edit**
  - Account resources: apna account
- Vercel account

## Steps

1. **Vercel → Add New → Project → Import Git Repository** → `yuvi-cmd/panel`.
   Root Directory default (`./`) hi rakho — `vercel.json` khud sab routes
   `api/panel.js` par bhejta hai. Framework preset: **Other**.
2. **Environment Variables** set karo (Production + Preview):

   | Key | Value |
   |---|---|
   | `CF_ACCOUNT_ID` | Cloudflare account id |
   | `CF_D1_DATABASE_ID` | D1 database id (`wrangler.toml` wala `database_id`) |
   | `CF_D1_API_TOKEN` | D1 Edit wala token |
   | `PANEL_CODE` | `YUVI_001` (ya jo chahiye) |
   | `PANEL_NAME` | panel ka naam |
   | `BCORE_SECRET` | **wahi value** jo Worker me hai |
   | `MUNDO_SALT` | **wahi value** jo Worker me hai |
   | `ARCX_TOKEN_SALT` | **wahi value** jo Worker me hai |
   | `FRONTEND_ORIGIN` | optional (CORS) |
   | `DEBUG_ERRORS` | optional, `1` = full error text |

   ⚠️ Secret values Worker se **same** hone chahiye, warna `/connect` ke
   encrypted responses miss-match karenge.
3. **Deploy** dabao. Pehli request par schema + migrations khud chalti hain
   (`ensureDB` → D1 REST) — kuch manual nahi.

## Zaroori notes

- `users`, `api_keys`, panel settings — sab **D1 me hi** hain, Vercel par koi
  alag data nahi. Worker aur Vercel ko ek hi DB par point karna hai (same
  `CF_D1_DATABASE_ID` / binding), tab dono same data dikhayenge.
- Har page render multiple D1 REST calls karta hai (session + theme + data) —
  normal usage me ~4-10 requests. Cold start par thoda slow ho sakta hai.
- `CF_D1_API_TOKEN` sirf D1 Edit permission do — account-wide token na do.
- Worker-only cheezein (`wrangler d1 execute`, native binding) Vercel par
  nahi chalti — DB direct Cloudflare dashboard / wrangler se manage karo.
- Local test: `node test/vercel-local.mjs` (fake REST + sqlite, network nahi
  chahiye).
