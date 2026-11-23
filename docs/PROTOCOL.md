# MAK/1 Protocol

This is the wire contract implemented by `src/mak/protocol.js`. It is the
authoritative reference for the Android host (`libymudo`) and guest runtime
(`libRcore`).

- Base URL: `https://YOUR-DOMAIN/mak/v1`
- Content type: `application/json`
- Transport: TLS 1.3
- Protocol string: `MAK/1`
- Server signatures: Ed25519
- Device keys and proofs: ECDSA P-256 + SHA-256

## 1. Canonical JSON

All signatures cover **canonical JSON**:

- object keys sorted by UTF-16 code unit order, ascending
- no insignificant whitespace
- strings escaped as JSON
- numbers must be finite
- `undefined` object values omitted
- arrays keep their order
- UTF-8 bytes on the wire

Server signature message:

```
MAK/1\nRESPONSE\n<canonical JSON of the payload without "signature">
```

`key_id` **is** part of the signed payload. `signature` is standard base64.
Clients must verify the signature against a pinned Ed25519 public key before
acting on any decision. The public keys are also published by `/status`, but
publication alone is not a trust anchor — pin at least one key in the app or
deliver it through a trusted update channel.

## 2. Server status

```
GET /status
```

Always available, even when the server is OFF and even when signing is not
configured (in that case the response is unsigned and
`"signing_ready": false`).

```json
{
  "protocol": "MAK/1",
  "service": "MAK Activation",
  "version": "1.0.0",
  "server_enabled": true,
  "signing_ready": true,
  "key_id": "MAK-ED25519-01",
  "public_keys": [
    { "key_id": "MAK-ED25519-01", "public_key": "BASE64", "active": true }
  ],
  "signature_alg": "Ed25519",
  "device_key_alg": "ECDSA-P256",
  "transport": "TLS 1.3",
  "heartbeat_interval": 300,
  "session_ttl": 3600,
  "challenge_ttl": 60,
  "server_time": 1795430000,
  "signature": "BASE64"
}
```

A client must treat `signing_ready: false` or a missing/invalid signature as
`SERVER_ERROR` / deny.

## 3. Challenge

```
POST /challenge
```

Request:

```json
{ "protocol": "MAK/1", "request_id": "REQ_1234" }
```

Response (signed):

```json
{
  "protocol": "MAK/1",
  "challenge_id": "CH_...",
  "nonce": "...",
  "expires_at": 1795430060,
  "server_time": 1795430000,
  "heartbeat_interval": 300,
  "session_ttl": 3600,
  "challenge_ttl": 60
}
```

Rules:

- nonce is cryptographically random and single use
- only `SHA256("MAK-CHALLENGE|" + nonce)` is stored server-side
- expired or consumed challenges fail with `CHALLENGE_EXPIRED` / `NONCE_REPLAY`
- authorization is denied while the server is OFF (`SERVER_DISABLED`, HTTP 503)

## 4. Authorize

```
POST /authorize
```

Request:

```json
{
  "protocol": "MAK/1",
  "request_id": "REQ_1234",
  "challenge_id": "CH_...",
  "nonce": "...",
  "timestamp": 1795430000,
  "license": { "credential": "MAK-XXXXX-XXXXX-XXXXX-XXXXX" },
  "host": {
    "package_name": "com.example.host",
    "version_code": 1,
    "signing_cert_sha256": "64-lowercase-hex"
  },
  "device": {
    "public_key": "spki:BASE64",
    "proof": "BASE64"
  }
}
```

Device proof message (UTF-8, newline separated, no trailing newline):

```
MAK/1
AUTHORIZE
<challenge_id>
<nonce>
<host package name>
<host signing cert sha256, lowercase hex>
<device public key exactly as sent>
<timestamp>
```

`proof` is ECDSA-SHA256 over that message using the device private key. The
server accepts:

- SPKI DER public keys as `spki:<base64>` (canonical storage form)
- raw P-256 points as `raw:<base64>`, internally converted to SPKI
- signatures in raw `r||s` (64 bytes) or ASN.1 DER form

Order of checks:

1. Protocol, challenge and nonce (single use, expires)
2. Timestamp within `clock_skew`
3. License lookup by SHA-256 verifier
4. License status, expiry and revocation
5. Device proof — **before** any host/device state is pinned
6. Host binding (`FIRST_USE` or `STRICT`) and host status
7. Device limit, device status, activation limit
8. Session issuance

Success (signed):

```json
{
  "protocol": "MAK/1",
  "decision": "ALLOW",
  "code": "AUTHORIZED",
  "request_id": "REQ_1234",
  "license": { "license_uid": "LIC-XXXXX-XXXXX", "expires_at": 1798022000 },
  "session": {
    "session_id": "SES_...",
    "issued_at": 1795430000,
    "expires_at": 1795433600
  },
  "host": { "package_name": "com.example.host", "signing_cert_sha256": "..." },
  "permissions": { "install": false, "launch": false, "update": false, "restart": false },
  "challenge": "...",
  "server_time": 1795430000,
  "heartbeat_interval": 300
}
```

`permissions` at this stage is host-scoped and always `false`; guest operations
are authorized separately by `/guest/check`.

Failures return HTTP 200/4xx/503 with a signed deny payload:

```json
{
  "protocol": "MAK/1",
  "decision": "DENY",
  "code": "HOST_CERT_MISMATCH",
  "request_id": "REQ_1234",
  "permissions": { "install": false, "launch": false, "update": false, "restart": false },
  "message": "Host certificate mismatch",
  "server_time": 1795430000
}
```

## 5. Guest check

```
POST /guest/check
```

Request:

```json
{
  "protocol": "MAK/1",
  "request_id": "REQ_1234",
  "session_id": "SES_...",
  "operation": "LAUNCH",
  "guest": {
    "package_name": "com.example.guest",
    "app_name": "Guest",
    "apk_sha256": "64-lowercase-hex",
    "signing_cert_sha256": "64-lowercase-hex",
    "version_code": 3
  },
  "device": {
    "public_key": "spki:BASE64",
    "proof": "BASE64",
    "timestamp": 1795430000
  }
}
```

`operation` is one of `INSTALL`, `LAUNCH`, `UPDATE`, `RESTART`.

Device proof message:

```
MAK/1
GUEST_CHECK
<session_id>
<OPERATION>
<guest package name>
<apk sha256, lowercase hex>
<signing cert sha256, lowercase hex>
<version_code as decimal integer>
<device public key exactly as sent>
<timestamp>
```

The proof timestamp must be within `clock_skew` of server time.

Server checks, in order: session (exists, active, not expired, license usable,
device active), guest identity (package, APK hash, cert hash, version), guest
app status, binding to the license, then the requested operation permission.
The guest must be registered in the panel and explicitly bound to the license
before any operation can succeed.

Success (signed):

```json
{
  "protocol": "MAK/1",
  "decision": "ALLOW",
  "code": "AUTHORIZED",
  "request_id": "REQ_1234",
  "operation": "LAUNCH",
  "session": { "session_id": "SES_...", "issued_at": 1795430000, "expires_at": 1795433600 },
  "host": { "package_name": "com.example.host", "signing_cert_sha256": "..." },
  "guest": {
    "package_name": "com.example.guest",
    "app_name": "Guest",
    "apk_sha256": "...",
    "signing_cert_sha256": "...",
    "version_code": 3
  },
  "permissions": { "install": false, "launch": true, "update": false, "restart": false },
  "issued_at": 1795430000,
  "expires_at": 1795430120,
  "server_time": 1795430000
}
```

Native code must enforce the signed operation result; it must not rely on
Java/Kotlin checks.

## 6. Renew and heartbeat

Both require device proof.

`POST /renew`

```json
{
  "protocol": "MAK/1",
  "request_id": "REQ_1234",
  "session_id": "SES_...",
  "device": { "public_key": "spki:BASE64", "proof": "BASE64", "timestamp": 1795430000 }
}
```

Proof message:

```
MAK/1
RENEW
<session_id>
<device public key exactly as sent>
<timestamp>
```

`POST /heartbeat` is identical with `HEARTBEAT` as the second line. Success
codes are `RENEWED` and `ALIVE`; both return the current session and
`heartbeat_interval`. Renewal never extends past the license expiry.

## 7. Client events

```
POST /events
```

```json
{
  "protocol": "MAK/1",
  "request_id": "REQ_1234",
  "session_id": "SES_...",
  "event_type": "INTEGRITY_FAILED",
  "error_code": "APK_INVALID",
  "detail": "signature check failed"
}
```

Recorded as `NATIVE_<EVENT_TYPE>` in the panel audit log. The response code is
`EVENT_RECORDED`. Event ingestion is informational only and never changes an
authorization decision.

## 8. Admin revoke

```
POST /revoke
```

Requires a panel admin session cookie and the `X-CSRF-Token` header. This
endpoint is not used by the Android client.

## 9. Error codes

| Code | Meaning |
| --- | --- |
| `INVALID_LICENSE` | Unknown MAK |
| `LICENSE_EXPIRED` | License past expiry |
| `LICENSE_SUSPENDED` | License suspended |
| `LICENSE_REVOKED` | License permanently revoked |
| `DEVICE_LIMIT_REACHED` | Device cap reached |
| `ACTIVATION_LIMIT_REACHED` | Activation cap reached |
| `HOST_PACKAGE_MISMATCH` | Wrong host package or suspended host |
| `HOST_CERT_MISMATCH` | Wrong host signing certificate |
| `GUEST_PACKAGE_MISMATCH` | Guest package not approved |
| `GUEST_HASH_MISMATCH` | Guest APK hash mismatch |
| `GUEST_CERT_MISMATCH` | Guest signer mismatch |
| `DEVICE_MISMATCH` | Proof key does not own this session |
| `INVALID_DEVICE_PROOF` | Bad or missing device signature |
| `CHALLENGE_EXPIRED` | Challenge missing or expired |
| `NONCE_REPLAY` | Challenge already consumed |
| `SESSION_EXPIRED` | Session missing or expired |
| `SESSION_REVOKED` | Session revoked |
| `INVALID_SIGNATURE` | Server signature rejected |
| `RESPONSE_EXPIRED` | Response/request outside validity window |
| `SERVER_ERROR` | Internal or rate-limit failure |
| `SERVER_DISABLED` | Global kill switch is OFF |
| `OPERATION_NOT_ALLOWED` | Guest permission not granted |
| `APK_INVALID` | Malformed guest identity |
| `UNKNOWN_ERROR` | Unrecognized request |

Native clients must deny on any unknown code, any missing signature, any
signature failure, any transport failure, and any response whose `protocol` is
not `MAK/1`.

## 10. Native enforcement notes

- `libymudo` (host main process) owns the MAK bootstrap, TLS transport,
  challenge/authorize lifecycle, signature verification and host policy.
- `libRcore` (guest-only) must verify the signed `/guest/check` result before
  install, launch, update or restart.
- `libclient.so` is untouched by this protocol.
- The MAK is read from the host engine bootstrap and lives only as long as
  needed to obtain a session. Do not persist it in world-readable storage.
- Never log raw MAK values, proofs, session tokens or private keys. Use the
  app-private log directory only.
- Treat root, hooking and debugger signals as risk indicators, not as a
  replacement for server decisions.
