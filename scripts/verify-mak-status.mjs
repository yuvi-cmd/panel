#!/usr/bin/env node
// Verify the live MAK/2 status endpoint.
//
//   node scripts/verify-mak-status.mjs
//   MAK_STATUS_URL=https://panel.example.workers.dev/mak/v2/status \
//     node scripts/verify-mak-status.mjs
//
// The policy is panel-managed keys:
//   - protocol is MAK/2
//   - signing_ready and encryption_ready are true
//   - key_source is PANEL (keys generated from /sdk/server, no Worker secrets)
//   - the published active Ed25519 key verifies the signed status payload
//   - every rotation link is signed by its previous key and ends at the
//     active signing + encryption keys
//
// scripts/mak-pins.json is optional. Leave its fields null for panel-managed
// keys, or fill them to additionally pin a specific deployment in CI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import nacl from 'tweetnacl';
import { canonicalJson } from '../src/mak/crypto.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_STATUS_URL = process.env.MAK_STATUS_URL
  || 'https://panel.itsalihasan75.workers.dev/mak/v2/status';
export const PINS = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'mak-pins.json'), 'utf8'));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function verifySignature(body, signature, publicKey) {
  try {
    return nacl.sign.detached.verify(
      new Uint8Array(Buffer.from(body)),
      new Uint8Array(Buffer.from(signature, 'base64')),
      new Uint8Array(Buffer.from(publicKey, 'base64')),
    );
  } catch {
    return false;
  }
}

function withoutSignature(value) {
  const body = { ...value };
  delete body.signature;
  return body;
}

export async function verifyMakStatus(url = DEFAULT_STATUS_URL, options = {}) {
  const requireServerEnabled = options.requireServerEnabled !== false;
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(Number(options.timeoutMs || 15000)),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      url,
      problems: [`status endpoint returned non-JSON (HTTP ${response.status})`],
      data: null,
    };
  }

  const problems = [];
  if (!response.ok) problems.push(`status endpoint returned HTTP ${response.status}`);
  if (data.protocol !== 'MAK/2') problems.push(`protocol is ${data.protocol || 'missing'}, expected MAK/2`);

  // First deploy bootstrap: no keys have been generated yet. This is only
  // accepted when the deployment is truly unconfigured (no keys at all), so a
  // later key loss is still a hard failure.
  const unconfigured = data.key_source === 'NONE'
    && Array.isArray(data.public_keys) && data.public_keys.length === 0
    && data.signing_ready === false && data.encryption_ready === false;
  if (options.allowUnconfigured && unconfigured && response.ok) {
    return { ok: true, url, problems: [], data, signatureValid: false, unconfigured: true };
  }
  if (data.signing_ready !== true) problems.push('signing_ready is not true');
  if (data.encryption_ready !== true) problems.push('encryption_ready is not true');
  if (requireServerEnabled && data.server_enabled !== true) problems.push('server_enabled is not true');
  if (data.key_source !== 'PANEL') {
    problems.push(`key_source is ${data.key_source || 'missing'}; generate keys from /sdk/server`);
  }

  const keys = Array.isArray(data.public_keys) ? data.public_keys : [];
  const active = keys.find((key) => key && key.active === true);
  if (!active) {
    problems.push('no active Ed25519 key is published');
  } else {
    if (data.key_id !== active.key_id) {
      problems.push(`key_id is ${data.key_id || 'missing'}, active published key is ${active.key_id}`);
    }
    if (!active.public_key) problems.push('active Ed25519 public key is empty');
  }

  if (!data.encryption_public_key) problems.push('encryption_public_key is missing');
  if (!data.encryption_key_id) problems.push('encryption_key_id is missing');

  // Optional explicit pins (CI). Null means panel-managed.
  if (PINS.ed25519_public_key) {
    const pinned = keys.find((key) => key && key.public_key === PINS.ed25519_public_key);
    if (!pinned) problems.push('pinned Ed25519 public key is not published by /mak/v2/status');
    else if (pinned.active !== true) problems.push('pinned Ed25519 public key is published but not active');
  }
  if (PINS.ed25519_key_id && active && active.key_id !== PINS.ed25519_key_id) {
    problems.push(`active key id is ${active.key_id}, pinned value is ${PINS.ed25519_key_id}`);
  }
  if (PINS.x25519_public_key && data.encryption_public_key !== PINS.x25519_public_key) {
    problems.push('encryption_public_key does not match the pinned X25519 key');
  }
  if (PINS.x25519_key_id && data.encryption_key_id !== PINS.x25519_key_id) {
    problems.push(`encryption_key_id is ${data.encryption_key_id || 'missing'}, expected ${PINS.x25519_key_id}`);
  }

  let signatureValid = false;
  if (typeof data.signature !== 'string' || !data.signature) {
    problems.push('status payload is unsigned');
  } else if (active?.public_key) {
    signatureValid = verifySignature(
      `MAK/2\nSTATUS\n${canonicalJson(withoutSignature(data))}`,
      data.signature,
      active.public_key,
    );
    if (!signatureValid) problems.push('status signature does not verify with the active Ed25519 key');
  }

  // Every rotation must be authenticated by the previous key and the last
  // link must land on the active signing + encryption key.
  const rotations = Array.isArray(data.rotations) ? data.rotations : [];
  for (const link of rotations) {
    const previous = keys.find((key) => key && key.key_id === link.previous_key_id);
    if (!previous) {
      problems.push(`rotation ${link.previous_key_id} -> ${link.new_key_id}: previous key is not published`);
      continue;
    }
    if (!link.signature || !verifySignature(
      `MAK/2\nROTATION\n${canonicalJson(withoutSignature(link))}`,
      link.signature,
      previous.public_key,
    )) {
      problems.push(`rotation ${link.previous_key_id} -> ${link.new_key_id}: signature is invalid`);
    }
    const next = keys.find((key) => key && key.key_id === link.new_key_id);
    if (!next) problems.push(`rotation target ${link.new_key_id} is not published`);
    else if (next.public_key !== link.new_signing_public_key) {
      problems.push(`rotation target ${link.new_key_id} public key mismatch`);
    }
  }
  if (rotations.length && active) {
    const last = rotations[rotations.length - 1];
    if (last.new_key_id !== active.key_id) {
      problems.push(`last rotation ends at ${last.new_key_id}, active key is ${active.key_id}`);
    }
    if (last.new_encryption_key_id !== data.encryption_key_id
      || last.new_encryption_public_key !== data.encryption_public_key) {
      problems.push('last rotation does not match the active encryption key');
    }
  }

  return { ok: problems.length === 0, url, problems, data, signatureValid };
}

export async function waitForMakStatus(url, options = {}) {
  const retries = Math.max(1, Number(options.retries || 1));
  const delayMs = Number(options.delayMs || 3000);
  let result;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      result = await verifyMakStatus(url, options);
    } catch (error) {
      result = {
        ok: false,
        url,
        problems: [`status request failed: ${error.message}`],
        data: null,
      };
    }
    if (result.ok) return result;
    if (attempt < retries) await sleep(delayMs);
  }
  return result;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  const urlArg = args.find((arg) => arg.startsWith('--url='));
  const url = urlArg ? urlArg.slice('--url='.length) : DEFAULT_STATUS_URL;
  const retries = Number(process.env.MAK_VERIFY_RETRIES || 1);
  const requireServerEnabled = !args.includes('--allow-disabled');
  const allowUnconfigured = args.includes('--allow-unconfigured');

  const result = await waitForMakStatus(url, { retries, requireServerEnabled, allowUnconfigured });
  if (!result.ok) {
    console.error(`FAIL: ${url}`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const data = result.data || {};
  if (result.unconfigured) {
    console.log(`PASS (bootstrap): ${url}`);
    console.log('  MAK/2 is deployed without keys yet.');
    console.log('  Open /sdk/server and press "Generate MAK/2 keys".');
    process.exit(0);
  }
  console.log(`PASS: ${url}`);
  console.log(`  protocol:            ${data.protocol}`);
  console.log(`  signing_ready:       ${data.signing_ready}`);
  console.log(`  encryption_ready:    ${data.encryption_ready}`);
  console.log(`  server_enabled:      ${data.server_enabled}`);
  console.log(`  key source:          ${data.key_source}`);
  console.log(`  active key:          ${data.key_id}`);
  console.log(`  envelope key:        ${data.encryption_key_id}`);
  console.log(`  rotations:           ${(data.rotations || []).length}`);
  console.log(`  status signature:    valid`);
}
