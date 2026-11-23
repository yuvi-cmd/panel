#!/usr/bin/env node
// Post-deploy verification for a live MAK/1 Worker.
//
//   MAK_BASE_URL=https://your-domain npm run check
//   MAK_PUBLIC_KEY=<base64 Ed25519 public key> MAK_KEY_ID=MAK-ED25519-01 npm run check
//
// The public key pin is optional but strongly recommended: without it the
// status response is only checked structurally, not cryptographically.

import nacl from 'tweetnacl';
import { b64decode, canonicalJson } from '../src/backend/crypto.js';

const base = String(process.argv[2] || process.env.MAK_BASE_URL || '').replace(/\/+$/, '');
if (!base) {
  console.error('Usage: MAK_BASE_URL=https://your-domain npm run check  [public-key]');
  process.exit(1);
}

const failures = [];
const warnings = [];

function ok(name, detail = '') {
  console.log('  ok  ' + name + (detail ? ' — ' + detail : ''));
}

function fail(name, detail) {
  failures.push(name + ': ' + detail);
  console.error('FAIL  ' + name + ' — ' + detail);
}

function warn(name, detail) {
  warnings.push(name + ': ' + detail);
  console.warn('WARN  ' + name + ' — ' + detail);
}

async function fetchJson(path, init = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: { Accept: 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* checked by caller */ }
  return { status: res.status, headers: res.headers, text, body };
}

function verifySignature(payload, publicKeyB64) {
  if (!payload || typeof payload !== 'object' || typeof payload.signature !== 'string') return false;
  const { signature, ...body } = payload;
  const message = `MAK/1\nRESPONSE\n${canonicalJson(body)}`;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      b64decode(signature),
      b64decode(publicKeyB64),
    );
  } catch {
    return false;
  }
}

console.log(`\nMAK/1 deployment check — ${base}\n`);

const status = await fetchJson('/mak/v1/status').catch((err) => {
  fail('status request', String(err && err.message ? err.message : err));
  return null;
});

if (status) {
  if (status.status === 200 && status.body) ok('status endpoint', 'HTTP 200');
  else fail('status endpoint', `HTTP ${status.status}, body is not JSON`);

  const body = status.body || {};
  if (body.protocol === 'MAK/1') ok('protocol', body.protocol);
  else fail('protocol', String(body.protocol));

  if (body.signature_alg === 'Ed25519') ok('signature algorithm', 'Ed25519');
  else fail('signature algorithm', String(body.signature_alg));

  if (body.device_key_alg === 'ECDSA-P256') ok('device key algorithm', 'ECDSA-P256');
  else fail('device key algorithm', String(body.device_key_alg));

  if (body.signing_ready === true) ok('signing key', 'configured and active');
  else fail('signing key', 'not configured — /authorize will fail closed');

  const keys = Array.isArray(body.public_keys) ? body.public_keys : [];
  if (keys.length && keys.every((k) => k && k.key_id && k.public_key)) ok('published public keys', String(keys.length));
  else fail('published public keys', 'missing or malformed');

  if (body.server_enabled === true) {
    ok('server state', 'ON');
  } else {
    warn('server state', 'OFF — every activation decision fails closed');
  }

  if (!body.signature) {
    fail('status signature', 'status is unsigned (signing key missing)');
  } else {
    const pinned = String(process.env.MAK_PUBLIC_KEY || '').trim();
    if (pinned) {
      const active = keys.find((k) => k.key_id === (process.env.MAK_KEY_ID || body.key_id));
      if (!active) {
        fail('pinned key', 'MAK_KEY_ID not present in published keys');
      } else if (verifySignature(body, pinned)) {
        ok('status signature', 'verified against pinned public key');
      } else {
        fail('status signature', 'does not verify against the pinned public key');
      }
    } else if (body.key_id) {
      const published = keys.find((k) => k.key_id === body.key_id);
      if (published && verifySignature(body, published.public_key)) {
        ok('status signature', 'self-consistent (pin MAK_PUBLIC_KEY for trust)');
      } else if (published) {
        fail('status signature', 'does not verify against the published key');
      } else {
        fail('status signature', 'key_id is not in public_keys');
      }
    } else {
      fail('status signature', 'key_id is missing');
    }
  }

  const header = status.headers.get('content-type') || '';
  if (header.includes('application/json')) ok('content type', header);
  else warn('content type', header || 'missing');
}

if (status?.body?.signing_ready === true) {
  const challenge = await fetchJson('/mak/v1/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ protocol: 'MAK/1', request_id: 'REQ_DEPLOY_CHECK' }),
  }).catch((err) => ({ status: 0, body: null, text: String(err) }));

  if (status.body.server_enabled === true) {
    if (challenge.status === 200 && challenge.body?.challenge_id && challenge.body?.nonce) {
      ok('challenge endpoint', 'fresh challenge issued');
      if (Number(challenge.body.expires_at) > Math.floor(Date.now() / 1000)) ok('challenge expiry', 'in the future');
      else fail('challenge expiry', String(challenge.body.expires_at));
    } else {
      fail('challenge endpoint', `HTTP ${challenge.status} ${challenge.text || ''}`.trim());
    }
  } else if (challenge.status === 503 && challenge.body?.code === 'SERVER_DISABLED') {
    ok('fail-closed kill switch', 'challenge denied while server is OFF');
  } else {
    fail('fail-closed kill switch', `expected 503 SERVER_DISABLED, got ${challenge.status} ${challenge.body?.code || ''}`);
  }
}

const panel = await fetch(base + '/login', { redirect: 'manual' }).catch(() => null);
if (!panel) {
  fail('login page', 'unreachable');
} else if (panel.status === 200) {
  const html = await panel.text();
  if (/MAK|Activation/i.test(html)) ok('login page', 'served');
  else fail('login page', 'unexpected content');
} else {
  fail('login page', `HTTP ${panel.status}`);
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed, ${warnings.length} warning(s)\n`);
  process.exitCode = 1;
} else {
  console.log(`All checks passed${warnings.length ? `, ${warnings.length} warning(s)` : ''}.\n`);
}
