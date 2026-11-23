# MAK/2 deployment

MAK/2 is the only public protocol. `/mak/v1/*` returns `410 PROTOCOL_REMOVED`.

## Keys are generated inside the panel

There are **no MAK keys to paste anywhere**. Open the panel:

1. Log in and go to **`/sdk/server`**.
2. Press **Generate MAK/2 keys** (or **Rotate MAK/2 keys** later).
3. The Worker creates an Ed25519 signing key and an X25519 envelope key,
   stores both in D1 (`mak_server_keys`) and publishes only the public halves
   at `GET /mak/v2/status`.
4. Every existing install accepts the next rotation through a signed chain:
   the previous Ed25519 key signs the new signing + encryption keys.

`MAK_SIGNING_KEY` / `MAK_ENC_KEY` Worker secrets are **not required**. They
remain supported as an optional legacy fallback for old deployments; panel
keys always take precedence.

## Deploy the Worker

`wrangler` cannot run on Android/Termux because its `workerd` binary has no
Android ARM64 build. Use either option below.

### Option A — GitHub Actions (recommended)

Add two repository secrets in
**Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN` — Workers Scripts:Edit + Account Settings:Read
- `CLOUDFLARE_ACCOUNT_ID`

Then run **Actions → Deploy panel → Run workflow**. The workflow runs the test
suite, deploys with `wrangler`, and fails unless the live status passes
`scripts/verify-mak-status.mjs`.

### Option B — PC / wrangler

```bash
npm ci
npm test
npx wrangler deploy
node scripts/verify-mak-status.mjs
```

### Option C — Cloudflare dashboard

Edit the Worker in the Cloudflare dashboard and paste the built bundle, or run
the GitHub workflow. The panel schema creates the key tables automatically on
the first request after deploy.

## Generate keys

After the deploy, open:

```text
https://YOUR-WORKER-URL/sdk/server
```

and press **Generate MAK/2 keys**. Then verify:

```bash
node scripts/verify-mak-status.mjs
```

A healthy deployment prints:

```text
PASS: https://panel.example.workers.dev/mak/v2/status
  protocol:            MAK/2
  signing_ready:       true
  encryption_ready:    true
  server_enabled:      true
  key source:          PANEL
  active key:          MAK-ED-XXXXXXXXXXXX
  envelope key:        MAK-ENC-XXXXXXXXXXXX
  rotations:           0
  status signature:    valid
```

## CI pinning (optional)

`scripts/mak-pins.json` is **optional**. Leave its fields `null` for
panel-managed keys. If you want CI to pin a specific deployment, fill in the
public values from `/mak/v2/status`; verification then also requires those
exact keys.

## Key rotation

1. Open `/sdk/server` and press **Rotate MAK/2 keys**.
2. The old Ed25519 key signs a rotation statement naming the new signing and
   encryption keys; `/mak/v2/status` publishes the chain.
3. Existing AAR installs verify the chain and switch automatically. No AAR
   rebuild is required.
4. Run `node scripts/verify-mak-status.mjs`.

If an install has no cached key yet, it pins the current active key on first
successful status fetch (TOFU over the TLS connection). After that, any key
change without a valid rotation chain is a hard DENY (`SERVER_KEY_CHANGED`).

## Legacy Worker secrets (optional)

Only needed if you deliberately want env-backed keys instead of panel keys:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
node scripts/set-worker-secrets.mjs ~/.config/mundo-mak/panel-secrets.env
```

The script never prints secret bytes. Panel-generated keys take precedence
over env keys, so this path is not used by the normal flow.

## Security checklist

- Generate keys **after** the first deploy, from `/sdk/server`.
- Never commit a secret key file. D1 stores the private halves; only the
  keystore reads them.
- `MAK/1` must stay removed; old clients must fail with `410`.
- The client is strict-online: server down or airplane mode means DENY.
- Rotate any GitHub/Cloudflare token that was pasted into a chat or issue.
