# C++ / Android host integration (MAK/2)

MAK/2 replaces MAK/1 and the retired MUNDO/BCore endpoints.

| Endpoint | Transport | Status |
| --- | --- | --- |
| `POST /sdk/mundo/:panel` | AES-128-ECB body | **Removed** |
| `POST /sdk/bcore/:panel` | RC4 + Base64 body | **Removed** |
| `/mak/v1/*` | JSON over TLS | **Removed — 410 `PROTOCOL_REMOVED`** |
| `GET /mak/v2/status` | JSON over TLS (public keys) | Current |
| `POST /mak/v2/activate` | NaCl box envelope | Current |
| `POST /mak/v2/host/verify` | NaCl box envelope | Current |
| `POST /mak/v2/guest/check` | NaCl box envelope | Current |
| `POST /mak/v2/status` | NaCl box envelope | Current |
| `POST /mak/v2/deactivate` | NaCl box envelope | Current |

Base URL:

```
https://panel.itsalihasan75.workers.dev/mak/v2
```

The AAR integrates everything internally. The host app does not change its
Java code or manifest, and there is no manual activation screen.

**No server key is compiled into the AAR.** The panel generates the Ed25519
signing key and the X25519 envelope key from `/sdk/server` →
**Generate MAK/2 keys**. The native client learns the public halves from
`GET /mak/v2/status`, pins them on first contact (TOFU) and accepts later
rotations only through the signed rotation chain. Rotating keys therefore does
not require an APK rebuild.

Full byte-level details: [PROTOCOL.md](PROTOCOL.md).

## 1. Bootstrap the server keys

```cpp
// GET /mak/v2/status
MakStatus st = mak.status_keys();      // native: https_get_json()
if (!st.signing_ready || !st.encryption_ready) return DENY; // SERVER_NOT_READY
mak.pin_or_rotate(st);                 // TOFU + rotation-chain verification
```

Rules enforced by native code:

- First run: pin active Ed25519 + X25519 public keys.
- Later runs: if the active key changed, verify `rotations[]` from the pinned
  key to the active key; each link must be signed by its previous key.
- No chain / bad signature / key id reuse with different bytes → **DENY**
  (`SERVER_KEY_CHANGED`).

## 2. Encrypted request envelope

Every POST body is exactly:

```json
{
  "v": 2,
  "e": "BASE64 ephemeral X25519 public key",
  "n": "BASE64 24-byte nonce",
  "c": "BASE64 secretbox ciphertext"
}
```

Native flow:

```cpp
client = x25519_keypair();                                  // fresh per call
shared = x25519_shared(client.secret, server_enc_public);
reqKey = hkdf_sha256(shared, nonce, "MAK/2-REQ");           // 32 bytes
inner  = canonical_json({ "protocol":"MAK/2", "endpoint":"activate", ... });
cipher = secretbox_seal(inner, nonce, reqKey);              // XSalsa20-Poly1305
post   = { "v":2, "e":b64(client.public), "n":b64(nonce), "c":b64(cipher) };
```

The response is exactly:

```json
{ "v": 2, "c": "BASE64 ciphertext", "sig": "BASE64 Ed25519" }
```

Native flow:

```cpp
respKey = hkdf_sha256(shared, nonce, "MAK/2-RESP");
plain   = secretbox_open(resp.c, nonce, respKey);
json    = parse(plain);
if (!ed25519_verify(keyring[json.key_id], "MAK/2\nENVELOPE\n" + plain, resp.sig)) return DENY;
if (!verify_signed(json, json.decision == "DENY" ? "ERROR" : expected_domain)) return DENY;
```

The outer envelope carries no `key_id`, protocol or decision — everything is
inside the ciphertext. Envelope nonces are single-use; a replay is
`409 NONCE_REPLAY`.

## 3. Activate

Inner request:

```json
{
  "protocol": "MAK/2",
  "endpoint": "activate",
  "request_id": "REQ_BOOT_001",
  "mak": "MAK-XXXXX-XXXXX-XXXXX-XXXXX",
  "package_name": "com.example.host",
  "app_name": "My Host App",
  "cert_sha256": "64-lowercase-hex"
}
```

Only `package_name`, `app_name`, `cert_sha256` and `MAK`. No `device_id`.

The decrypted response contains a signed `grant` (`expires_at`, `epoch`,
`max_apps`, `max_installs`, `signature_bind`) and an outer `RESPONSE`
signature. Persist the grant; it is required for later calls.

## 4. Host verify

Call before the host UI opens:

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

Returns a signed `HOST-TICKET`. Native code must verify it before showing any
protected UI.

## 5. Guest check (INSTALL / LAUNCH / UPDATE / RESTART)

Call before **every** operation:

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

`signature_bind=1` requires the guest certificate; `0` ignores certificates.
AUTO binds on first use; MANUAL needs pre-registration.

Returns `code: "AUTHORIZED"` with a signed ticket (`LAUNCH-TICKET`,
`INSTALL-TICKET` or `OP`) and a `permissions` object. Native code verifies the
ticket domain, operation, guest identity, host identity, expiry and permissions
before doing anything.

`LAUNCH` and `RESTART` are denied with `INSTALL_REQUIRED` unless the native
install record exists (`<data>/files/mak/installed/<package>.json`), i.e. the
app was installed through MUNDO.

## 6. C++ pseudo-code

```cpp
MakClient mak(dataDir, serverUrl);          // keys learned at runtime

// 1. Pin/rotate server keys
if (!mak.refresh_server_keys(err)) return DENY;

MakResult a = mak.activate(makCredential);
if (a.decision != "ALLOW") return DENY;

MakResult h = mak.host_verify();
if (h.decision != "ALLOW") return DENY;

MakResult g = mak.guest_check("LAUNCH", guest);
if (g.decision != "ALLOW" ||
    !g.permissions.launch) return DENY;

// 2. Verify ticket + install record, then launch
```

## 7. Required native checks

1. `signing_ready` and `encryption_ready` are true.
2. Envelope decrypts with `MAK/2-RESP` and the per-request nonce.
3. Envelope Ed25519 signature verifies over the exact plaintext.
4. Inner signature (`RESPONSE`/`ERROR`/ticket domain) verifies with a key in the
   TOFU/rotation keyring.
5. Key id matches the key used for verification.
6. `protocol == "MAK/2"`, decision, code and operation match the request.
7. Grant `expires_at` / `epoch` are current; server time did not move backwards
   beyond `MAK_CLOCK_SKEW_SECONDS`.
8. Host package + certificate match the grant.
9. Guest package + certificate match the ticket; `version_code` matches.
10. The exact permission for the operation is true.
11. Ticket `nonce` matches the request nonce and the ticket is fresh.
12. `LAUNCH`/`RESTART` has a native install record.

Any mismatch is a hard deny. Server down or airplane mode is also a deny; there
is no offline cached launch path.
