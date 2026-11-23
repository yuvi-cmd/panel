# MAK/2 protocol

MAK/2 is the only public protocol, implemented by
`src/mak/protocol-v2.js` + `src/mak/secure.js` + `src/mak/keystore.js`.
`/mak/v1/*` always returns **410 `PROTOCOL_REMOVED`**.

There is **no device_id** and **no client timestamp** in MAK/2. Every request
is encrypted and every decision is signed. The server public keys are
generated from the panel (`/sdk/server` → **Generate MAK/2 keys**), stored in
D1, and published at `GET /mak/v2/status`; they are never compiled into the
APK.

- Base URL: `https://YOUR-DOMAIN/mak/v2`
- Content type: `application/json`
- Transport: TLS 1.3 + NaCl box (X25519 + XSalsa20-Poly1305) + HKDF-SHA256
- Encryption: **not AES**
- Signatures: Ed25519
- Protocol string: `MAK/2`

## 1. Canonical JSON

Every signed message covers canonical JSON:

- object keys sorted ascending (UTF-16 code unit order)
- no insignificant whitespace
- UTF-8 bytes on the wire
- arrays keep their order
- numbers must be finite

Signature messages:

```
MAK/2\nSTATUS\n<canonical JSON without "signature">
MAK/2\nGRANT\n<canonical JSON without "signature">
MAK/2\nHOST-TICKET\n<canonical JSON without "signature">
MAK/2\nLAUNCH-TICKET\n<canonical JSON without "signature">
MAK/2\nINSTALL-TICKET\n<canonical JSON without "signature">
MAK/2\nOP\n<canonical JSON without "signature">
MAK/2\nRESPONSE\n<canonical JSON without "signature">
MAK/2\nERROR\n<canonical JSON without "signature">
MAK/2\nROTATION\n<canonical JSON without "signature">
MAK/2\nENVELOPE\n<exact plaintext response bytes>
```

`key_id` **is** part of the signed inner payload. `signature` is standard
base64. The outer response envelope has no `key_id`; the client takes it from
the decrypted payload, then verifies the envelope signature over the exact
plaintext.

## 2. Server status (key bootstrap)

```
GET /mak/v2/status
```

Readable without an envelope; it only publishes public data.

```json
{
  "protocol": "MAK/2",
  "service": "MAK Activation",
  "signing_ready": true,
  "key_id": "MAK-ED-1A2B3C4D5E6F",
  "public_keys": [
    { "key_id": "MAK-ED-1A2B3C4D5E6F", "public_key": "BASE64", "active": true },
    { "key_id": "MAK-ED-0A1B2C3D4E5F", "public_key": "BASE64", "active": false }
  ],
  "key_source": "PANEL",
  "rotations": [
    {
      "v": 2,
      "previous_key_id": "MAK-ED-0A1B2C3D4E5F",
      "new_key_id": "MAK-ED-1A2B3C4D5E6F",
      "new_signing_public_key": "BASE64",
      "new_encryption_key_id": "MAK-ENC-1A2B3C4D5E6F",
      "new_encryption_public_key": "BASE64",
      "signed_at": 1795430000,
      "signature": "BASE64"
    }
  ],
  "encryption_ready": true,
  "encryption_key_id": "MAK-ENC-1A2B3C4D5E6F",
  "encryption_public_key": "BASE64",
  "transport": "TLS 1.3 + NaCl box",
  "server_time": 1795430000,
  "signature": "BASE64"
}
```

Trust rules:

1. First contact: pin the active Ed25519 key + X25519 key (TOFU). This is the
   only time no previous key exists.
2. Later: if the active key differs from the pinned one, the client must find a
   `rotations[]` chain from the pinned key to the active key. Each link must be
   Ed25519-verified with the previous link's key and must name the active
   signing + encryption keys.
3. Any key change without a valid chain is a hard DENY
   (`SERVER_KEY_CHANGED`). The client never downgrades to an unauthenticated
   key.

## 3. Request / response envelope

Request (POST body, exact outer shape):

```json
{
  "v": 2,
  "e": "BASE64 32-byte client ephemeral X25519 public key",
  "n": "BASE64 24-byte random nonce",
  "c": "BASE64 NaCl secretbox ciphertext"
}
```

Response (exact outer shape):

```json
{
  "v": 2,
  "c": "BASE64 NaCl secretbox ciphertext",
  "sig": "BASE64 Ed25519 signature"
}
```

Nothing else is exposed. Decision, `key_id`, `protocol` and all data live
inside the ciphertext.

Client-side steps for every request:

1. `client = X25519 keypair` (fresh per request).
2. `shared = X25519(client_secret, server_encryption_public_key)`.
3. `reqKey = HKDF-SHA256(ikm=shared, salt=nonce, info="MAK/2-REQ", 32 bytes)`.
4. Plaintext = canonical JSON of the inner request.
5. `c = NaCl secretbox(plaintext, nonce, reqKey)`.
6. POST `{v:2,e,n,c}`.

Response handling:

1. `respKey = HKDF-SHA256(ikm=shared, salt=nonce, info="MAK/2-RESP", 32 bytes)`.
2. `plaintext = secretbox_open(c, nonce, respKey)`.
3. Parse JSON. Take `key_id` from the parsed payload.
4. Verify `Ed25519(public_key_of(key_id), "MAK/2\nENVELOPE\n" + plaintext)` against `sig`.
5. Verify the inner payload signature (`RESPONSE` or `ERROR` domain).
6. Only then act on the decision.

Envelope nonces are single-use server-side; a replayed envelope returns
`409 NONCE_REPLAY`.

## 4. `POST /mak/v2/activate`

Inner request (`endpoint` must be `activate`):

```json
{
  "protocol": "MAK/2",
  "endpoint": "activate",
  "request_id": "REQ_ACTIVATE_001",
  "mak": "MAK-XXXXX-XXXXX-XXXXX-XXXXX",
  "package_name": "com.example.host",
  "app_name": "My Host App",
  "cert_sha256": "64-lowercase-hex"
}
```

- `package_name`, `app_name`, `cert_sha256`, `mak` only. No device id.
- `cert_sha256` is required when the license has Signature Bind ON; ignored
  when it is OFF.
- AUTO licenses bind the host package on first use. MANUAL licenses require the
  package to be pre-registered.

Decrypted response:

```json
{
  "protocol": "MAK/2",
  "decision": "ALLOW",
  "code": "ACTIVATED",
  "request_id": "REQ_ACTIVATE_001",
  "grant": {
    "v": 2,
    "grant_id": "GRT-...",
    "license_uid": "...",
    "package_name": "com.example.host",
    "app_name": "My Host App",
    "cert_sha256": "64-hex or empty",
    "signature_bind": true,
    "features": ["INSTALL", "LAUNCH", "UPDATE", "RESTART"],
    "max_apps": 2,
    "max_installs": 3,
    "expires_at": 1798022000,
    "epoch": 1,
    "issued_at": 1795430000,
    "key_id": "MAK-ED-...",
    "signature": "BASE64"
  },
  "server_time": 1795430000,
  "key_id": "MAK-ED-...",
  "signature": "BASE64"
}
```

Store the grant locally. The client enforces `expires_at` against the server
clock (`server_time`) and detects clock rollback; the server re-checks expiry
on every later call.

## 5. `POST /mak/v2/host/verify`

Call before the host opens its own UI or grants any guest operation.

```json
{
  "protocol": "MAK/2",
  "endpoint": "host/verify",
  "request_id": "REQ_HOST_001",
  "mak": "MAK-...",
  "grant_id": "GRT-...",
  "package_name": "com.example.host",
  "cert_sha256": "64-hex",
  "nonce": "BASE64 24-byte single-use"
}
```

Returns `code: "HOST_VERIFIED"` and a signed `ticket` with domain
`HOST-TICKET`, `ticket_id` prefix `HT`.

## 6. `POST /mak/v2/guest/check`

Call before **every** INSTALL / LAUNCH / UPDATE / RESTART.

```json
{
  "protocol": "MAK/2",
  "endpoint": "guest/check",
  "request_id": "REQ_GUEST_001",
  "mak": "MAK-...",
  "grant_id": "GRT-...",
  "package_name": "com.example.host",
  "cert_sha256": "64-hex",
  "operation": "LAUNCH",
  "nonce": "BASE64 24-byte single-use",
  "guest": {
    "package_name": "com.example.guest",
    "app_name": "Guest App",
    "apk_sha256": "64-hex",
    "cert_sha256": "64-hex",
    "version_code": 42
  }
}
```

- `operation` is one of `INSTALL`, `LAUNCH`, `UPDATE`, `RESTART`.
- Signature Bind ON: guest `cert_sha256` is mandatory and apps are matched by
  package + certificate.
- Signature Bind OFF: certificates are ignored; apps are matched by package.
- AUTO binds the guest on first use; MANUAL requires pre-registration.

Decrypted response:

```json
{
  "protocol": "MAK/2",
  "decision": "ALLOW",
  "code": "AUTHORIZED",
  "request_id": "REQ_GUEST_001",
  "ticket": {
    "v": 2,
    "ticket_id": "LT-...",
    "grant_id": "GRT-...",
    "operation": "LAUNCH",
    "host": { "package_name": "...", "app_name": "...", "cert_sha256": "..." },
    "guest": { "package_name": "...", "app_name": "...", "apk_sha256": "...", "cert_sha256": "...", "version_code": 42 },
    "expires_at": 1798022000,
    "issued_at": 1795430000,
    "nonce": "BASE64",
    "epoch": 1,
    "key_id": "MAK-ED-...",
    "signature": "BASE64"
  },
  "permissions": { "launch": true, "install": true, "update": true, "restart": true },
  "server_time": 1795430000,
  "key_id": "MAK-ED-...",
  "signature": "BASE64"
}
```

Ticket domains: `LAUNCH-TICKET`, `INSTALL-TICKET`, `OP` (UPDATE/RESTART).
The native gate must verify the ticket domain, operation, guest identity and
expiry before launching.

## 7. `POST /mak/v2/status`

Authenticated license/grant status. Same envelope, inner request
`{protocol, endpoint:"status", request_id, mak, grant_id}`. Response is an
`ALLOW`/`DENY` with `status: ACTIVE|EXPIRED|REVOKED`.

## 8. `POST /mak/v2/deactivate`

Revokes the grant and bumps the license epoch. Inner request
`{protocol, endpoint:"deactivate", request_id, mak, grant_id}`.

## 9. Error responses

Errors are sealed in the same envelope and signed with domain `ERROR`:

```json
{
  "protocol": "MAK/2",
  "decision": "DENY",
  "code": "LICENSE_EXPIRED",
  "message": "License is not active",
  "server_time": 1795430000,
  "key_id": "MAK-ED-...",
  "signature": "BASE64"
}
```

Common codes: `INVALID_LICENSE`, `LICENSE_EXPIRED`, `LICENSE_REVOKED`,
`LICENSE_SUSPENDED`, `HOST_PACKAGE_MISMATCH`, `HOST_CERT_MISMATCH`,
`PACKAGE_LIMIT_REACHED`, `INSTALL_LIMIT_REACHED`, `APP_LIMIT_REACHED`,
`GUEST_CERT_MISMATCH`, `OPERATION_NOT_ALLOWED`, `NONCE_REPLAY`,
`ENVELOPE_INVALID`, `SERVER_DISABLED`, `SERVER_ERROR`.

Any malformed envelope, bad signature, unknown key, expired grant or missing
ticket is a hard deny. Server down / airplane mode also means deny: there is no
offline cached launch path.
