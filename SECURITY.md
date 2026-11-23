# Security Policy

## Reporting

Do not open a public issue for a vulnerability. Use GitHub's **private
vulnerability reporting** (Security → Advisories → Report a vulnerability) on
this repository. Include:

- affected endpoint or component
- reproduction steps or a proof of concept
- impact assessment
- whether a MAK, device key or admin session was exposed

You will get an acknowledgement, a triage decision and a coordinated disclosure
timeline. Do not test against licenses, devices or infrastructure you do not
own.

## Supported versions

Only the current `main` branch is supported. There are no maintained release
branches.

## Security model

### Server-authoritative decisions

Every activation, guest operation, renewal and heartbeat decision is made by
the Worker. Responses are signed with Ed25519 and covered by canonical JSON:

```
MAK/1\nRESPONSE\n<canonical JSON without "signature">
```

A client must reject:

- a missing or malformed signature
- an unknown `key_id`
- a signature that does not verify against a pinned public key
- a protocol other than `MAK/1`
- any unknown error code
- any transport failure

This is fail-closed by design. The Android native layer (`libymudo`,
`libRcore`) is the enforcement point; Java/Kotlin only bootstraps the MAK.

### Credentials and keys

| Secret | Where it lives | Notes |
| --- | --- | --- |
| MAK credential | Host APK engine bootstrap | Shown once at issuance; server stores only SHA-256 verifier |
| Ed25519 signing seed | Worker secret `MAK_SIGNING_KEY` / `MAK_SIGNING_KEYS` | Never in git, `wrangler.toml`, APK or AAR |
| Admin password | D1, PBKDF2-SHA256 | Never logged |
| Admin session token | HttpOnly cookie, SHA-256 in D1 | `SameSite=Strict`, `Secure` on HTTPS |
| Device private key | Android Keystore / app-private storage | ECDSA P-256; never leaves the device |
| IP hash salt | Worker secret `IP_HASH_SALT` | Optional; hashes client IPs in audit logs |

The AAR must not contain a static AES key, master secret or server signing key.
The MAK is a credential, not the security system.

### Replay and freshness

- Challenges are random, short-lived, single-use, and stored only as
  `SHA256("MAK-CHALLENGE|" + nonce)`.
- Device proofs bind the challenge, host identity, device key and timestamp.
- Session proofs bind the session, operation, guest identity, device key and
  timestamp; timestamps outside `clock_skew` are rejected.
- Challenges are consumed before authorization continues, so a failed proof
  cannot be retried with the same nonce.

### Host and guest binding

- Host binding is `FIRST_USE` (pin on first valid device proof) or `STRICT`
  (must match a pre-registered package + certificate).
- Device proof is verified **before** host/device state is pinned, so a leaked
  MAK alone cannot steal first use.
- Guest apps must be registered by exact package, APK SHA-256, signing
  certificate SHA-256 and version code, then explicitly bound to the license.
- Every guest operation (`INSTALL`, `LAUNCH`, `UPDATE`, `RESTART`) has its own
  permission flag.

### Global kill switch

Setting the server OFF immediately makes `/challenge`, `/authorize`,
`/guest/check`, `/renew`, `/heartbeat` and `/events` fail closed with
`SERVER_DISABLED` (HTTP 503). `/status` and the admin panel remain available.
Enabling requires a valid signing key.

## Operational guidance

- Use a custom domain with Cloudflare TLS; do not rely on `workers.dev` for
  production.
- Set `SETUP_CODE` before the first deploy, then remove or rotate it after the
  owner account exists.
- Store all secrets with `wrangler secret put`; never commit `.dev.vars`.
- Rotate the signing key with a key ring: add `MAK-ED25519-02`, ship its public
  key to clients, switch `MAK_SIGNING_KEY_ID`, then retire the old key.
- Rotate `IP_HASH_SALT` only if you accept losing IP correlation in old logs.
- Export D1 backups before schema changes.
- Review `/logs` for `AUTH_FAIL`, `INVALID_DEVICE_PROOF`, `NONCE_REPLAY`,
  `HOST_CERT_MISMATCH` and `GUEST_HASH_MISMATCH` spikes.
- Run `MAK_BASE_URL=... MAK_PUBLIC_KEY=... npm run check` after every deploy.

## Known limitations

- **Transport encryption:** TLS 1.3 protects the wire. An HPKE
  (X25519 + HKDF-SHA256 + AEAD) application-layer envelope is planned for the
  Android integration phase; it is not part of the current Worker protocol.
- **Rate limiting** is in-memory per Worker isolate. It is a brake, not a
  distributed quota. Put Cloudflare WAF/rate-limiting rules in front of
  `/mak/v1/*` and `/login` for production.
- **Panel authentication** is single-role (owner). There is no multi-admin UI
  yet; use Cloudflare Access in front of the panel if you need SSO or IP
  allow-listing.
- **Legacy D1 tables:** an existing database may still contain old
  `bcore_*` / `mundo_*` tables. The panel never reads or writes them. Drop them
  manually after taking a backup if you want a clean database.
- **No client code in this repository.** Native enforcement, certificate
  pinning and MAK bootstrap live in the separate MUNDO Android project.

## Incident response

1. Set **Server OFF** in the panel (fail closed immediately).
2. Revoke the affected license, device and/or all sessions.
3. Rotate the affected MAK; revoke the old credential.
4. If the signing key may be exposed, rotate the key ring and ship the new
   public key before re-enabling the server.
5. Preserve `/logs` output and D1 backups for analysis.
6. Review admin sessions, change the admin password, and rotate `SETUP_CODE`.
7. Re-enable the server only after the root cause is fixed and verified.
