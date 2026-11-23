# Deployment

Target: Cloudflare Worker + D1, no origin server.

## Prerequisites

- Cloudflare account with Workers and D1 enabled
- Node.js 20+ and npm
- `npx wrangler` (installed by `npm install`)
- A domain on Cloudflare for production (optional for a first smoke test)

## 1. Install

```bash
npm install
npx wrangler login
```

## 2. Create D1

```bash
npx wrangler d1 create panel
```

Copy the returned `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "panel"
database_id = "<your-database-id>"
```

If you are reusing an existing database, keep its current id and apply the
schema; the panel tables are namespaced with `mak_` and do not touch legacy
tables.

## 3. Apply the schema

```bash
npm run db:migrate
```

The Worker also runs `CREATE TABLE IF NOT EXISTS` on boot, but running the
migration explicitly gives you a clean, reviewable first deploy.

To verify:

```bash
npx wrangler d1 execute panel --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

## 4. Signing key

Generate a fresh Ed25519 seed **outside** the repository:

```bash
npm run keys -- --public
```

This prints:

- a base64 32-byte seed for `MAK_SIGNING_KEY`
- the matching public key to pin in the Android client

Store the seed as a Worker secret:

```bash
npx wrangler secret put MAK_SIGNING_KEY
```

Optional secrets:

```bash
npx wrangler secret put IP_HASH_SALT      # hashes client IPs in audit logs
npx wrangler secret put SETUP_CODE        # gate for /setup
```

Never put secret values in `wrangler.toml`, `.dev.vars` committed to git, or
the repository. `.dev.vars` is git-ignored for local development only.

### Key rotation

For zero-downtime rotation use a key ring:

```bash
npm run keys -- --keyring --public
npx wrangler secret put MAK_SIGNING_KEYS
npx wrangler secret put MAK_SIGNING_KEY_ID
```

`MAK_SIGNING_KEYS` is a JSON array:

```json
[
  { "key_id": "MAK-ED25519-01", "seed": "BASE64" },
  { "key_id": "MAK-ED25519-02", "seed": "BASE64" }
]
```

`MAK_SIGNING_KEY_ID` selects the active signing key. `/status` publishes all
public keys so clients can accept both during the overlap. Ship the new public
key to clients before switching `MAK_SIGNING_KEY_ID`, then remove the old entry.

## 5. Deploy

```bash
npm run deploy
```

`wrangler.toml` sets `workers_dev = true`, so you get a
`https://panel.<subdomain>.workers.dev` URL immediately. For production,
attach a custom domain from **Workers & Pages → your Worker → Settings →
Domains & Routes**, and put Cloudflare WAF/rate-limiting rules in front of
`/login` and `/mak/v1/*`.

## 6. First-run setup

1. Open `https://your-domain/setup`.
2. Create the owner account (username + 10–200 character password).
3. If `SETUP_CODE` is configured, enter it.
4. Confirm `/settings` shows the signing key as ready.
5. Leave the server ON only after the client public key is pinned.

`/setup` is available only while no admin exists. To re-run setup, remove the
admin rows deliberately (and revoke all sessions first).

## 7. Verify

```bash
MAK_BASE_URL=https://your-domain \
MAK_PUBLIC_KEY=<base64-public-key> \
MAK_KEY_ID=MAK-ED25519-01 \
npm run check
```

The checker verifies:

- `/status` is `MAK/1`, Ed25519, signing-ready and publishes keys
- the status signature verifies against the pinned key
- `/challenge` issues a fresh unexpired nonce (or fails closed with
  `SERVER_DISABLED` when the server is OFF)
- `/login` serves the panel

## Local development

```bash
npm run dev
```

Note: Wrangler's `workerd` binary does not support Android/Termux. On Android
use `npm test`, which runs the full panel and MAK/1 flow against an in-memory
D1-compatible database via Node's built-in SQLite.

## Smoke test after deployment

1. Sign in and issue a test MAK with `max_devices: 1`, `max_activations: 1`.
2. Register the host package + certificate (or use `FIRST_USE`).
3. Run `/authorize` from the client with a valid device proof.
4. Register a guest build and bind it with only `LAUNCH` permission.
5. Confirm `LAUNCH` is `ALLOW` and `INSTALL` is `OPERATION_NOT_ALLOWED`.
6. Toggle **Server OFF** and confirm `/challenge` returns 503
   `SERVER_DISABLED`.
7. Revoke the device and confirm the next authorized call fails closed.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `/settings` says signing key missing | `MAK_SIGNING_KEY` not set or not base64 32-byte seed | Re-run `npm run keys`, `wrangler secret put MAK_SIGNING_KEY`, redeploy |
| All MAK calls return 503 `SERVER_DISABLED` | Global kill switch is OFF | Turn the server ON in the dashboard (requires valid signing key) |
| `Database binding DB is not configured` | `[[d1_databases]]` binding missing or wrong id | Fix `wrangler.toml`, redeploy |
| Login loops back to `/login` | Cookie blocked or clock skew | Use HTTPS, check browser cookie settings, verify system time |
| `NONCE_REPLAY` | Challenge reused | Request a fresh challenge for each `/authorize` |
| `HOST_CERT_MISMATCH` | Different signing certificate or strict host mismatch | Reset the host binding in the panel only after verifying the build |
| Rate-limit 429s | Per-isolate limiter | Add Cloudflare rate-limiting rules; retry with backoff |

## Rollback

```bash
npx wrangler deployments list
npx wrangler rollback <deployment-id>
```

D1 schema changes are additive (`CREATE TABLE IF NOT EXISTS`), so rolling back
the Worker does not require a database rollback. Take a D1 export before any
manual schema change.
