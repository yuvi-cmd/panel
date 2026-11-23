# C++ / Android host integration (MAK/1)

This guide replaces the retired MUNDO and BCore client endpoints.

| Old endpoint | Old transport | Status |
| --- | --- | --- |
| `POST /sdk/mundo/:panel` | AES-128-ECB body | **Removed** |
| `POST /sdk/bcore/:panel` | RC4 + Base64 body | **Removed** |
| `POST /mak/v1/challenge` | JSON over TLS 1.3 | Current |
| `POST /mak/v1/authorize` | JSON over TLS 1.3 | Current |
| `POST /mak/v1/guest/check` | JSON over TLS 1.3 | Current |
| `POST /mak/v1/renew` | JSON over TLS 1.3 | Current |
| `POST /mak/v1/heartbeat` | JSON over TLS 1.3 | Current |
| `POST /mak/v1/events` | JSON over TLS 1.3 | Current |

Base URL:

```
https://panel.itsalihasan75.workers.dev/mak/v1
```

There is no manual activation screen and no key-entry UI. The native host
performs the flow below automatically. Every security decision is signed with
the server Ed25519 key and must be verified by the client. A missing or invalid
signature means **DENY**.

The full canonical-JSON and signature rules are in
[PROTOCOL.md](PROTOCOL.md).

## 1. Get the server identity

```
GET /status
```

Pin at least one Ed25519 public key from a trusted build/update channel. Treat
`signing_ready:false` as `SERVER_ERROR`.

## 2. Challenge

```
POST /challenge
Content-Type: application/json

{"protocol":"MAK/1","request_id":"REQ_BOOT_001"}
```

Response:

```json
{
  "protocol": "MAK/1",
  "challenge_id": "CH_...",
  "nonce": "...",
  "expires_at": 1795430060,
  "server_time": 1795430000,
  "heartbeat_interval": 300,
  "session_ttl": 3600,
  "challenge_ttl": 60,
  "signature": "BASE64"
}
```

The nonce is single use. Do not cache or retry it after a failed authorize.

## 3. Device proof + authorize

Generate an ECDSA P-256 key in Android Keystore. Build the proof message with
newline separators and no trailing newline:

```
MAK/1
AUTHORIZE
<challenge_id>
<nonce>
<host_package_name>
<host_cert_sha256 lower-case hex>
<device_public_key exactly as sent>
<timestamp unix seconds>
```

Sign the UTF-8 bytes with ECDSA-SHA256 and send the signature as base64.
Public keys may be sent as `spki:<base64>` (preferred) or `raw:<base64>`.
Signatures may be raw `r||s` (64 bytes) or ASN.1 DER.

```
POST /authorize
Content-Type: application/json

{
  "protocol": "MAK/1",
  "request_id": "REQ_AUTH_001",
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

Success returns a signed `ALLOW` with `session.session_id`. Host-level
`permissions` are always false; guest operations are authorized separately.

## 4. Authorize each guest operation

Call this before every `INSTALL`, `LAUNCH`, `UPDATE` and `RESTART`:

```
POST /guest/check
Content-Type: application/json

{
  "protocol": "MAK/1",
  "request_id": "REQ_GUEST_001",
  "session_id": "SES_...",
  "operation": "LAUNCH",
  "guest": {
    "package_name": "com.example.guest",
    "app_name": "Guest Application",
    "apk_sha256": "64-lowercase-hex",
    "signing_cert_sha256": "64-lowercase-hex",
    "version_code": 1
  },
  "device": {
    "public_key": "spki:BASE64",
    "proof": "BASE64",
    "timestamp": 1795430000
  }
}
```

Device proof message for guest checks:

```
MAK/1
GUEST_CHECK
<session_id>
<operation>
<guest_package_name>
<guest_apk_sha256 lower-case hex>
<guest_cert_sha256 lower-case hex>
<version_code>
<device_public_key exactly as sent>
<timestamp>
```

The response contains exactly one allowed permission, for example:

```json
{
  "protocol": "MAK/1",
  "decision": "ALLOW",
  "code": "AUTHORIZED",
  "operation": "LAUNCH",
  "guest": { "...": "..." },
  "permissions": { "install": false, "launch": true, "update": false, "restart": false },
  "issued_at": 1795430000,
  "expires_at": 1795430300,
  "server_time": 1795430000,
  "signature": "BASE64"
}
```

If the decision is `DENY`, the native engine must refuse the operation.

## 5. Renew and heartbeat

```
POST /renew
POST /heartbeat
```

Both require a valid device proof. `renew` returns a new session expiry;
`heartbeat` updates liveness. A revoked license, device or session fails closed
immediately.

Device proof message:

```
MAK/1
<renew|heartbeat>
<session_id>
<device_public_key exactly as sent>
<timestamp>
```

## 6. C++ pseudo-code

```cpp
MakClient mak(baseUrl, pinnedEd25519Keys);

auto ch = mak.post("/challenge", {{"protocol", "MAK/1"}});
if (!mak.verifySigned(ch)) return DENY;

auto proof = keystore.sign(deviceProofMessage(
    "AUTHORIZE", ch.challenge_id, ch.nonce, hostPackage,
    hostCertSha256, devicePublicKey, now()));

auto auth = mak.post("/authorize", {
  {"protocol", "MAK/1"},
  {"request_id", requestId()},
  {"challenge_id", ch.challenge_id},
  {"nonce", ch.nonce},
  {"timestamp", now()},
  {"license", {{"credential", makCredential}}},
  {"host", {{"package_name", hostPackage},
            {"signing_cert_sha256", hostCertSha256}}},
  {"device", {{"public_key", devicePublicKey}, {"proof", proof}}}
});
if (!mak.verifySigned(auth) || auth.decision != "ALLOW") return DENY;

auto session = auth.session.session_id;

auto guestDecision = mak.guestCheck(session, "LAUNCH", guest);
if (!mak.verifySigned(guestDecision) ||
    guestDecision.decision != "ALLOW" ||
    !guestDecision.permissions.launch) {
  return DENY;
}
// Proceed with the protected install/launch.
```

## 7. Required client checks

Verify all of the following before acting:

1. Ed25519 server signature.
2. Pinned key ID.
3. Protocol string `MAK/1`.
4. Decision and operation.
5. Request ID and challenge (authorize).
6. Host package + signing certificate.
7. Guest package + APK hash + signing certificate (guest check).
8. Permission for the exact operation.
9. Issue/expiry timestamps and session ID.

Any mismatch is a hard deny.
