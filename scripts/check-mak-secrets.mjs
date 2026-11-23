#!/usr/bin/env node
// Validate a local MAK/2 key file without talking to Cloudflare.
//
//   node scripts/check-mak-secrets.mjs /path/to/MAK-v2-Keys.txt
//   MAK_KEYS_FILE=/path/to/panel-secrets.env node scripts/check-mak-secrets.mjs
//
// The script prints public key fingerprints only. Secret bytes never leave
// the process.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_KEYS_FILE, loadMakSecrets, readPins, validateAgainstPins,
} from './lib/mak-secrets.mjs';

export function checkMakSecrets(file) {
  const secrets = loadMakSecrets(file || process.env.MAK_KEYS_FILE || DEFAULT_KEYS_FILE);
  const pins = readPins(path.join(path.dirname(fileURLToPath(import.meta.url)), 'mak-pins.json'));
  const problems = validateAgainstPins(secrets, pins);
  return { secrets, pins, problems };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const file = process.argv[2] || process.env.MAK_KEYS_FILE || DEFAULT_KEYS_FILE;
  try {
    const { secrets, pins, problems } = checkMakSecrets(file);
    console.log(`Key file: ${secrets.file}`);
    console.log(`Signing key ID: ${secrets.signingKeyId}`);
    console.log(`Encryption key ID: ${secrets.encKeyId}`);
    console.log(`Ed25519 public key: ${secrets.ed25519PublicKey}`);
    console.log(`X25519 public key:  ${secrets.x25519PublicKey}`);
    console.log(`Pinned Ed25519:     ${pins.ed25519_public_key}`);
    console.log(`Pinned X25519:      ${pins.x25519_public_key}`);
    if (problems.length) {
      for (const problem of problems) console.error(`FAIL: ${problem}`);
      process.exit(1);
    }
    console.log('PASS: key file matches the public keys pinned in the AAR');
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
  }
}
