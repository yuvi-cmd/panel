// Generate the MAK/2 Ed25519 signing keypair and X25519 envelope keypair.
//
// Output is intentionally split: public values are safe to embed in the AAR,
// secrets must be stored as Cloudflare Worker secrets (never committed).
//
//   node scripts/mak-keys.mjs
//
// Then:
//   wrangler secret put MAK_SIGNING_KEY
//   wrangler secret put MAK_SIGNING_KEY_ID
//   wrangler secret put MAK_ENC_KEY
//   wrangler secret put MAK_ENC_KEY_ID

import nacl from 'tweetnacl';
import { randomBytes } from 'node:crypto';

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const hex = (bytes) => Buffer.from(bytes).toString('hex');

const signingSeed = randomBytes(32);
const signing = nacl.sign.keyPair.fromSeed(new Uint8Array(signingSeed));

const encSecret = randomBytes(32);
const enc = nacl.box.keyPair.fromSecretKey(new Uint8Array(encSecret));

const keyId = 'MAK-ED25519-01';
const encKeyId = 'MAK-ENC-01';

console.log('MAK/2 key material');
console.log('==================');
console.log('');
console.log('Cloudflare secrets (keep private):');
console.log('  MAK_SIGNING_KEY     = ' + b64(signingSeed));
console.log('  MAK_SIGNING_KEY_ID  = ' + keyId);
console.log('  MAK_ENC_KEY         = ' + b64(encSecret));
console.log('  MAK_ENC_KEY_ID      = ' + encKeyId);
console.log('');
console.log('Public values (safe to pin in the AAR):');
console.log('  ed25519_public_key  = ' + b64(signing.publicKey));
console.log('  ed25519_public_hex  = ' + hex(signing.publicKey));
console.log('  x25519_public_key   = ' + b64(enc.publicKey));
console.log('  x25519_public_hex   = ' + hex(enc.publicKey));
