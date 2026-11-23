#!/usr/bin/env node
// Generate a 32-byte Ed25519 signing seed for MAK/1.
// Usage:
//   node scripts/generate-keys.mjs            # one secret
//   node scripts/generate-keys.mjs --keyring  # JSON key ring with two entries
//   node scripts/generate-keys.mjs --public   # also print the public key

import nacl from 'tweetnacl';

function seed() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function publicKey(seedBytes) {
  return b64(nacl.sign.keyPair.fromSeed(seedBytes).publicKey);
}

const args = new Set(process.argv.slice(2));
const seedA = seed();

if (args.has('--keyring')) {
  const seedB = seed();
  const ring = [
    { key_id: 'MAK-ED25519-01', seed: b64(seedA) },
    { key_id: 'MAK-ED25519-02', seed: b64(seedB) },
  ];
  console.log('# Set these as Worker secrets, never in wrangler.toml or git:');
  console.log(`npx wrangler secret put MAK_SIGNING_KEYS`);
  console.log(JSON.stringify(ring));
  console.log(`npx wrangler secret put MAK_SIGNING_KEY_ID`);
  console.log('MAK-ED25519-02');
  if (args.has('--public')) {
    console.log('\n# Public keys (published by /mak/v1/status):');
    for (const entry of ring) console.log(`${entry.key_id}: ${publicKey(Buffer.from(entry.seed, 'base64'))}`);
  }
} else {
  console.log('# Set this as a Worker secret, never in wrangler.toml or git:');
  console.log('npx wrangler secret put MAK_SIGNING_KEY');
  console.log(b64(seedA));
  if (args.has('--public')) {
    console.log('\n# Public key (shipped in host trust store):');
    console.log(publicKey(seedA));
  }
}
