// MAK/2 encrypted envelope — NaCl box (X25519 + XSalsa20-Poly1305) with
// HKDF-SHA256 key separation. This is deliberately NOT AES.
//
// Request  : { v:2, e:<client ephemeral X25519 pub>, n:<24-byte nonce>, c:<cipher> }
// Response : { v:2, c:<cipher>, sig:<Ed25519>, key_id:<signing key id> }
//
// The server static X25519 keypair comes from the MAK_ENC_KEY Worker secret.
// A fresh client keypair and nonce are required per request; the nonce is also
// stored server-side so an envelope cannot be replayed.

import nacl from 'tweetnacl';
import {
  PROTOCOL_V2, b64decode, b64encode, canonicalJson, hkdfSha256,
  loadEncryptionConfig, loadSigningConfig, utf8, fromUtf8,
  secureEqualBytes,
} from './crypto.js';

const NONCE_BYTES = 24;
const MIN_CIPHER_BYTES = 16;

export class EnvelopeError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

export function isEnvelope(body) {
  return !!body && typeof body === 'object' && body.v === 2 && body.e && body.n && body.c;
}

export async function openRequest(body, env) {
  const enc = loadEncryptionConfig(env);
  if (!enc.ok) throw new EnvelopeError('ENCRYPTION_NOT_CONFIGURED', enc.reason);

  const clientPub = b64decode(body.e);
  const nonce = b64decode(body.n);
  const cipher = b64decode(body.c);
  if (clientPub.length !== 32) throw new EnvelopeError('ENVELOPE_INVALID', 'client key must be 32 bytes');
  if (nonce.length !== NONCE_BYTES) throw new EnvelopeError('ENVELOPE_INVALID', 'nonce must be 24 bytes');
  if (cipher.length < MIN_CIPHER_BYTES) throw new EnvelopeError('ENVELOPE_INVALID', 'ciphertext is empty');

  let shared;
  try {
    shared = nacl.box.before(clientPub, enc.secret_key);
  } catch {
    throw new EnvelopeError('ENVELOPE_INVALID', 'X25519 key agreement failed');
  }
  const key = await hkdfSha256(shared, nonce, PROTOCOL_V2 + '-REQ');
  let plain;
  try {
    plain = nacl.secretbox.open(cipher, nonce, key);
  } catch {
    plain = null;
  }
  if (!plain) throw new EnvelopeError('ENVELOPE_INVALID', 'decrypt failed');

  let payload;
  try {
    payload = JSON.parse(fromUtf8(plain));
  } catch {
    throw new EnvelopeError('ENVELOPE_INVALID', 'payload is not JSON');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new EnvelopeError('ENVELOPE_INVALID', 'payload must be an object');
  }
  return { payload, shared, nonce, clientPub };
}

export async function sealResponse(payload, ctx, env) {
  const signing = loadSigningConfig(env);
  if (!signing.ok) throw new EnvelopeError('SERVER_ERROR', 'signing key is not configured');

  const key = await hkdfSha256(ctx.shared, ctx.nonce, PROTOCOL_V2 + '-RESP');
  const plaintext = canonicalJson(payload);
  const cipher = nacl.secretbox(utf8(plaintext), ctx.nonce, key);
  // Envelope signature covers the exact plaintext bytes. The inner response
  // may also carry its own domain signature for defence in depth.
  const message = `${PROTOCOL_V2}\nENVELOPE\n${plaintext}`;
  const signature = nacl.sign.detached(utf8(message), signing.active.secret_key);
  return {
    v: 2,
    c: b64encode(cipher),
    sig: b64encode(signature),
    key_id: signing.active.key_id,
  };
}

// Constant-time check used by callers that need to compare endpoint tags.
export function sameBytes(a, b) {
  return secureEqualBytes(a, b);
}
