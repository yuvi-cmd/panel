# MUNDO MAK — Activation Control Plane

Premium activation panel for the **MUNDO ACTIVATION KEY (MAK/1)** protocol.
Cloudflare Worker + D1, zero third-party runtime services, server-authoritative
and fail-closed by design.

- Ed25519-signed activation decisions
- ECDSA P-256 device identity and device proof
- Host APK binding by package name + signing certificate SHA-256
- Per-guest-app approvals with `INSTALL`, `LAUNCH`, `UPDATE`, `RESTART` permissions
- Sessions, renewal, heartbeat, revocation and a full audit trail
- Global **Server ON/OFF** kill switch; panel stays reachable while activation is OFF

## Panel

`GET /healthz` is an unauthenticated deployment probe. It never touches D1 and
returns the current build stamp, so a stale deploy is immediately obvious.

| Page | Purpose |
| --- | --- |
| `/setup` | First-run owner account (single use, optional `SETUP_CODE` gate) |
| `/login` | PBKDF2-SHA256 admin login, HttpOnly `SameSite=Strict` session cookie |
| `/dashboard` | Activation overview, kill switch, recent security events |
| `/licenses` | Issue/rotate MAKs, expiry, device/activation limits, host bind mode |
| `/guests` | Register approved guest builds (package, APK hash, cert hash, version) |
| `/hosts` | Host bindings: suspend, reactivate, reset |
| `/devices` | Device registry: revoke or delete |
| `/sessions` | Live MAK sessions: revoke one or all |
| `/logs` | Filterable audit log |
| `/settings` | Signing status, protocol timings, password, danger actions |

A raw MAK is displayed **once** at issuance or rotation. Only its SHA-256
verifier is stored; the panel cannot recover a lost credential.

## Protocol

Base URL: `https://YOUR-DOMAIN/mak/v1`

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/status` | GET | Public, signed service metadata and signing public keys |
| `/challenge` | POST | Single-use nonce for `/authorize` |
| `/authorize` | POST | MAK + host + device proof → signed session |
| `/guest/check` | POST | Per-operation guest authorization |
| `/renew` | POST | Extend an active session (device proof required) |
| `/heartbeat` | POST | Keep-alive / liveness (device proof required) |
| `/events` | POST | Client security event ingest |
| `/revoke` | POST | Admin-only revocation (panel cookie + CSRF header) |

Every response that carries a security decision is signed:

```
signature = Ed25519( "MAK/1\nRESPONSE\n" + canonicalJSON(payloadWithoutSignature) )
```

The `key_id` is included in the payload. Clients must pin the server public key
or verify against a key delivered through a trusted channel, then verify the
signature **before** acting on any `ALLOW`. Unknown or unsigned decisions fail
closed.

See [docs/PROTOCOL.md](docs/PROTOCOL.md) for request/response shapes, device
proof messages, canonicalisation rules, error codes and native enforcement
notes.

## Deploy (Cloudflare)

```bash
npm install
npx wrangler login

# 1. Create the D1 database once, then copy its id into wrangler.toml.
npx wrangler d1 create panel

# 2. Apply the schema.
npm run db:migrate

# 3. Generate an Ed25519 signing seed and store it as a Worker secret.
npm run keys -- --public
npx wrangler secret put MAK_SIGNING_KEY
# optional but recommended:
npx wrangler secret put IP_HASH_SALT
npx wrangler secret put SETUP_CODE

# 4. Deploy.
npm run deploy

# 5. Verify the live deployment.
MAK_BASE_URL=https://your-domain MAK_PUBLIC_KEY=<public-key> npm run check
```

`wrangler.toml` already binds D1 as `DB` and targets `main`. Replace the
`database_id` if you create a fresh database. `workers_dev = true` gives you a
`*.workers.dev` URL; attach a custom domain from the Cloudflare dashboard.
After the first deploy open `/setup`, create the owner account, then confirm the
signing key is reported as ready on `/settings`.

Details: [docs/DEPLOY.md](docs/DEPLOY.md).

## Local verification

Wrangler's bundled `workerd` does not run on Android/Termux, so the test suite
uses Node's built-in SQLite behind a small D1-compatible adapter.

```bash
npm test
```

The suite covers MAK parsing, canonical JSON, Ed25519 signing and tamper
rejection, PBKDF2 passwords, ECDSA P-256 device proofs (SPKI/raw/DER), panel
setup and CSRF, license issuance, first-use host binding, guest permission
enforcement, challenge replay, server kill switch, suspension, revocation and
login/logout.

## Security model

- **Server-authoritative.** A signed `ALLOW` is required for every security
  decision. Native code in `libymudo` / `libRcore` performs enforcement; the
  Java/Kotlin layer only bootstraps the MAK.
- **Fail closed.** Missing signing key, server OFF, unknown error code, malformed
  response, bad signature, expired session or revoked license all deny.
- **No shared secrets.** The AAR ships no static AES key or master secret. The
  MAK is a credential, not the security system.
- **Device proof before binding.** `/authorize` verifies the ECDSA proof before
  pinning host or device state, so a leaked MAK alone cannot steal first use.
- **No raw credentials in logs.** Only SHA-256 verifiers and hashed IPs are
  stored. Proofs and session tokens are never logged.
- **Admin hardening.** PBKDF2-SHA256 password hashing, D1-backed sessions,
  rotation on password change, CSRF tokens on every mutating request, login rate
  limiting and same-origin checks.

See [SECURITY.md](SECURITY.md).

## Layout

```
schema.sql                  D1 schema (authoritative)
src/index.js                Worker entrypoint
src/backend/router.js       Panel routes, auth, actions
src/backend/mak.js          MAK/1 protocol endpoints
src/backend/store.js        D1 repository + panel aggregates
src/backend/crypto.js       MAK, Ed25519, ECDSA, PBKDF2, canonical JSON
src/backend/auth.js         Admin sessions and CSRF
src/frontend/               Server-rendered UI kit and pages
scripts/generate-keys.mjs   Ed25519 seed generator
scripts/sync-schema.mjs     schema.sql → src/backend/schema.js
test/unit.mjs               End-to-end MAK/1 verification
test/check.mjs              Live deployment checker
```

## License

Proprietary. All rights reserved.
