// Shared MAK/2 key loading + pin validation.
//
// Secret values are never printed by this module. Public keys are safe to
// compare against scripts/mak-pins.json (the same values are compiled into
// the AAR by Mundo-Sdk/src/main/cpp/mak/mak_config.h).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nacl from 'tweetnacl';

export const DEFAULT_KEYS_FILE = path.join(
  process.env.HOME || '',
  '.config',
  'mundo-mak',
  'panel-secrets.env',
);

export function parseKeyFile(text) {
  const values = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\s+#.*$/, '').trim();
    if (value) values[match[1]] = value;
  }
  return values;
}

function decodeKey(value, name) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error(`${name} is missing`);
  let bytes;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    bytes = Buffer.from(raw, 'hex');
  } else {
    bytes = Buffer.from(raw, 'base64');
  }
  if (bytes.length !== 32) {
    throw new Error(`${name} must be a base64/hex 32-byte value (got ${bytes.length} bytes)`);
  }
  return bytes;
}

export function loadMakSecrets(file = DEFAULT_KEYS_FILE) {
  const resolved = path.resolve(file);
  const text = fs.readFileSync(resolved, 'utf8');
  const values = parseKeyFile(text);
  const signingSeed = decodeKey(values.MAK_SIGNING_KEY, 'MAK_SIGNING_KEY');
  const encSecret = decodeKey(values.MAK_ENC_KEY, 'MAK_ENC_KEY');

  const signing = nacl.sign.keyPair.fromSeed(new Uint8Array(signingSeed));
  const enc = nacl.box.keyPair.fromSecretKey(new Uint8Array(encSecret));

  return {
    file: resolved,
    signingSeed,
    encSecret,
    signingKeyId: values.MAK_SIGNING_KEY_ID || 'MAK-ED25519-01',
    encKeyId: values.MAK_ENC_KEY_ID || 'MAK-ENC-01',
    ed25519PublicKey: Buffer.from(signing.publicKey).toString('base64'),
    x25519PublicKey: Buffer.from(enc.publicKey).toString('base64'),
  };
}

export function readPins(file) {
  const resolved = file
    || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mak-pins.json');
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

export function validateAgainstPins(secrets, pins) {
  const problems = [];
  // Pins are optional now: production keys are generated from /sdk/server and
  // published at /mak/v2/status. A null pin means "no CI pin for this key".
  if (pins.ed25519_key_id && secrets.signingKeyId !== pins.ed25519_key_id) {
    problems.push(`MAK_SIGNING_KEY_ID is ${secrets.signingKeyId}, pinned value is ${pins.ed25519_key_id}`);
  }
  if (pins.x25519_key_id && secrets.encKeyId !== pins.x25519_key_id) {
    problems.push(`MAK_ENC_KEY_ID is ${secrets.encKeyId}, pinned value is ${pins.x25519_key_id}`);
  }
  if (pins.ed25519_public_key && secrets.ed25519PublicKey !== pins.ed25519_public_key) {
    problems.push('MAK_SIGNING_KEY does not derive the pinned Ed25519 public key');
  }
  if (pins.x25519_public_key && secrets.x25519PublicKey !== pins.x25519_public_key) {
    problems.push('MAK_ENC_KEY does not derive the pinned X25519 public key');
  }
  return problems;
}
