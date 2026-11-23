#!/usr/bin/env node
// Set the MAK/2 Worker secrets through the Cloudflare API.
//
//   export CLOUDFLARE_API_TOKEN=...
//   export CLOUDFLARE_ACCOUNT_ID=...
//   node scripts/set-worker-secrets.mjs /path/to/MAK-v2-Keys.txt
//
// This exists because wrangler/workerd does not run on Android/Termux. The
// GitHub Actions workflow can deploy the Worker, while this script only
// updates the two values that must never be committed:
//   MAK_SIGNING_KEY  (32-byte Ed25519 seed, base64)
//   MAK_ENC_KEY      (32-byte X25519 secret, base64)
//
// The public key IDs are plain vars in wrangler.toml. The script refuses to
// run when the local key file does not match scripts/mak-pins.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForMakStatus, DEFAULT_STATUS_URL } from './verify-mak-status.mjs';
import {
  DEFAULT_KEYS_FILE, loadMakSecrets, readPins, validateAgainstPins,
} from './lib/mak-secrets.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://api.cloudflare.com/client/v4';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function cf(token, pathname, options = {}) {
  const response = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.success === false) {
    const detail = payload?.errors?.map((e) => `${e.code}:${e.message}`).join('; ')
      || `HTTP ${response.status}`;
    throw new Error(`${pathname}: ${detail}`);
  }
  return payload;
}

async function resolveAccount(token, explicit) {
  if (explicit) return explicit;
  const payload = await cf(token, '/accounts?per_page=50');
  const accounts = Array.isArray(payload.result) ? payload.result : [];
  if (accounts.length === 1) return accounts[0].id;
  if (!accounts.length) throw new Error('token cannot read any Cloudflare account');
  const names = accounts.map((account) => `${account.name} (${account.id})`).join(', ');
  throw new Error(`CLOUDFLARE_ACCOUNT_ID is required; token can see: ${names}`);
}

function wranglerKeyId(name) {
  try {
    const text = fs.readFileSync(path.join(SCRIPT_DIR, '..', 'wrangler.toml'), 'utf8');
    const match = text.match(new RegExp(`^\\s*${name}\\s*=\\s*"([^"]+)"`, 'm'));
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const keysFile = args.find((arg) => !arg.startsWith('--'))
  || process.env.MAK_KEYS_FILE
  || DEFAULT_KEYS_FILE;
const worker = process.env.CLOUDFLARE_WORKER_NAME || 'panel';
const token = process.env.CLOUDFLARE_API_TOKEN || '';
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';

if (!dryRun && !token) fail('CLOUDFLARE_API_TOKEN is not set');
if (!fs.existsSync(keysFile)) fail(`key file not found: ${keysFile}`);

const pins = readPins(path.join(SCRIPT_DIR, 'mak-pins.json'));
const secrets = loadMakSecrets(keysFile);
const problems = validateAgainstPins(secrets, pins);
const signingVar = wranglerKeyId('MAK_SIGNING_KEY_ID');
const encVar = wranglerKeyId('MAK_ENC_KEY_ID');
if (pins.ed25519_key_id && signingVar && signingVar !== pins.ed25519_key_id) {
  problems.push(`wrangler.toml MAK_SIGNING_KEY_ID is ${signingVar}, expected ${pins.ed25519_key_id}`);
}
if (pins.x25519_key_id && encVar && encVar !== pins.x25519_key_id) {
  problems.push(`wrangler.toml MAK_ENC_KEY_ID is ${encVar}, expected ${pins.x25519_key_id}`);
}
if (problems.length) {
  for (const problem of problems) console.error(`FAIL: ${problem}`);
  process.exit(1);
}

const values = [
  ['MAK_SIGNING_KEY', secrets.signingSeed.toString('base64')],
  ['MAK_ENC_KEY', secrets.encSecret.toString('base64')],
];

console.log(`Worker: ${worker}`);
console.log(`Key file: ${secrets.file}`);
console.log(`Pinned Ed25519 key: ${secrets.ed25519PublicKey}`);
console.log(`Pinned X25519 key:  ${secrets.x25519PublicKey}`);
for (const [name] of values) console.log(`Plan: set secret ${name}`);
if (dryRun) {
  console.log('DRY RUN: no Cloudflare API calls made');
  process.exit(0);
}

const account = await resolveAccount(token, accountId).catch((error) => fail(error.message));
console.log(`Account: ${account}`);

for (const [name, value] of values) {
  await cf(token, `/accounts/${account}/workers/scripts/${worker}/secrets`, {
    method: 'PUT',
    body: JSON.stringify({ name, text: value, type: 'secret_text' }),
  }).catch((error) => fail(error.message));
  console.log(`SET: ${name}`);
}

console.log('Waiting for /mak/v2/status to reflect the new keys...');
const result = await waitForMakStatus(DEFAULT_STATUS_URL, {
  retries: Number(process.env.MAK_VERIFY_RETRIES || 8),
  delayMs: 3000,
  requireServerEnabled: false,
});
if (!result.ok) {
  for (const problem of result.problems) console.error(`FAIL: ${problem}`);
  process.exit(1);
}
console.log('PASS: live status now uses the pinned signing + encryption keys');
