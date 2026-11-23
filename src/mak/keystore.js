// MAK/2 server keyring — panel-managed signing + envelope keys.
//
// Keys are generated from the panel (/sdk/server) and stored in D1. Nothing
// has to be compiled into the AAR and no Worker secret has to be pasted
// anywhere. The public halves are published by GET /mak/v2/status; the secret
// halves never leave this module.
//
// Rotation is authenticated: the previous Ed25519 key signs a statement that
// names the new signing + encryption keys, and that chain is published in
// /mak/v2/status. A client that still trusts the old key accepts the new one
// only after verifying this chain.
//
// Environment secrets are still supported as a fallback for old deployments:
// MAK_SIGNING_KEY / MAK_ENC_KEY. Panel-generated keys always take precedence.

import nacl from 'tweetnacl';
import {
  PROTOCOL_V2,
  b64decode,
  b64encode,
  bytesToHex,
  canonicalJson,
  loadEncryptionConfig,
  loadSigningConfig,
  nowS,
  randomBytes,
  sha256Hex,
  signingPublicKeys,
  utf8,
} from './crypto.js';

const CACHE_TTL_MS = 15_000;
const MAX_PUBLISHED_ROTATIONS = 32;
const cache = new WeakMap();
let cacheEpoch = 0;

export function invalidateKeyCache() {
  cacheEpoch += 1;
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function signingFromRows(rows) {
  const keys = [];
  let active = null;
  for (const row of rows) {
    if (String(row.algorithm || '').toUpperCase() !== 'ED25519') continue;
    const secret = b64decode(row.secret_key);
    if (secret.length !== 64) continue;
    let pair;
    try {
      pair = nacl.sign.keyPair.fromSecretKey(secret);
    } catch {
      continue;
    }
    const publicKey = b64encode(pair.publicKey);
    // A tampered row must never silently change the published key.
    if (row.public_key && row.public_key !== publicKey) continue;
    const key = {
      key_id: String(row.key_id),
      public_key: publicKey,
      secret_key: pair.secretKey,
      seed: pair.secretKey.subarray(0, 32),
      status: normalizeStatus(row.status),
      created_at: Number(row.created_at || 0),
    };
    keys.push(key);
    if (key.status === 'ACTIVE') active = key;
  }
  if (!keys.length || !active) {
    return { ok: false, reason: 'No panel-generated Ed25519 key is active', keys: [], active: null };
  }
  return { ok: true, reason: '', keys, active };
}

function encryptionFromRows(rows) {
  let active = null;
  for (const row of rows) {
    if (String(row.algorithm || '').toUpperCase() !== 'X25519') continue;
    const secret = b64decode(row.secret_key);
    if (secret.length !== 32) continue;
    let pair;
    try {
      pair = nacl.box.keyPair.fromSecretKey(secret);
    } catch {
      continue;
    }
    const publicKey = b64encode(pair.publicKey);
    if (row.public_key && row.public_key !== publicKey) continue;
    if (normalizeStatus(row.status) !== 'ACTIVE') continue;
    active = {
      ok: true,
      reason: '',
      key_id: String(row.key_id),
      public_key: publicKey,
      secret_key: pair.secretKey,
      created_at: Number(row.created_at || 0),
    };
  }
  if (!active) {
    return {
      ok: false,
      reason: 'No panel-generated X25519 key is active',
      key_id: null,
      public_key: null,
      secret_key: null,
    };
  }
  return active;
}

async function readRows(db) {
  if (!db) return [];
  try {
    const result = await db.prepare(
      'SELECT key_id,algorithm,public_key,secret_key,status,created_at FROM mak_server_keys ORDER BY created_at ASC',
    ).all();
    return rowsOf(result);
  } catch {
    return [];
  }
}

async function readRotations(db) {
  if (!db) return [];
  try {
    const result = await db.prepare(
      'SELECT statement,signature FROM mak_server_key_rotations ORDER BY id ASC LIMIT ' + MAX_PUBLISHED_ROTATIONS,
    ).all();
    const out = [];
    for (const row of rowsOf(result)) {
      let statement;
      try {
        statement = JSON.parse(row.statement);
      } catch {
        continue;
      }
      if (!statement || typeof statement !== 'object') continue;
      out.push({ ...statement, signature: String(row.signature || '') });
    }
    return out;
  } catch {
    return [];
  }
}

function envOnly(env) {
  const signing = loadSigningConfig(env || {});
  const encryption = loadEncryptionConfig(env || {});
  const source = signing.ok && encryption.ok ? 'ENV'
    : signing.ok || encryption.ok ? 'ENV' : 'NONE';
  return { signing, encryption, source, rotations: [], panelKeys: false };
}

// Returns the exact config objects used by the signing/encryption helpers.
// Panel keys win over env secrets. Cached for a few seconds per env object.
export async function loadKeyConfig(db, env, options = {}) {
  const cacheable = env && typeof env === 'object';
  if (cacheable && !options.force) {
    const hit = cache.get(env);
    if (hit && hit.epoch === cacheEpoch && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.value;
    }
  }

  const rows = await readRows(db);
  const rotations = await readRotations(db);
  const dbSigning = signingFromRows(rows);
  const dbEncryption = encryptionFromRows(rows);
  const fallback = envOnly(env);

  const signing = dbSigning.ok ? dbSigning : fallback.signing;
  const encryption = dbEncryption.ok ? dbEncryption : fallback.encryption;
  const source = dbSigning.ok && dbEncryption.ok ? 'PANEL'
    : dbSigning.ok || dbEncryption.ok ? 'MIXED'
      : fallback.source;

  const value = {
    signing,
    encryption,
    source,
    rotations,
    panelKeys: dbSigning.ok && dbEncryption.ok,
  };

  if (cacheable) {
    cache.set(env, { at: Date.now(), epoch: cacheEpoch, value });
  }
  return value;
}

// Public, non-secret view for the panel and /mak/v2/status.
export function publicKeysView(config) {
  return signingPublicKeys(config).map((key) => ({
    key_id: key.key_id,
    public_key: key.public_key,
    active: !!key.active,
  }));
}

export async function publicKeyFingerprint(publicKeyB64) {
  const bytes = b64decode(publicKeyB64);
  if (bytes.length !== 32) return '';
  const hex = (await sha256Hex(bytes)).toUpperCase();
  return hex.slice(0, 16).replace(/(.{4})(?=.)/g, '$1 ');
}

function rotationStatement(previousSigning, newSigning, newEncryption) {
  return {
    v: 2,
    previous_key_id: previousSigning.key_id,
    new_key_id: newSigning.key_id,
    new_signing_public_key: newSigning.public_key,
    new_encryption_key_id: newEncryption.key_id,
    new_encryption_public_key: newEncryption.public_key,
    signed_at: nowS(),
  };
}

async function readActiveSigningRow(db) {
  const rows = await readRows(db);
  return signingFromRows(rows);
}

// Generate a fresh Ed25519 + X25519 pair, retire the old active rows and (when
// there is a previous signing key) publish a signed rotation link.
export async function generateServerKeys(db, options = {}) {
  if (!db) throw new Error('D1 binding is not configured');

  const previous = await readActiveSigningRow(db);
  const previousSigning = previous.ok ? previous.active : null;

  const suffix = bytesToHex(randomBytes(6)).toUpperCase();
  const signingPair = nacl.sign.keyPair();
  const encryptionPair = nacl.box.keyPair();

  const signing = {
    key_id: 'MAK-ED-' + suffix,
    public_key: b64encode(signingPair.publicKey),
    secret_key: signingPair.secretKey,
  };
  const encryption = {
    key_id: 'MAK-ENC-' + suffix,
    public_key: b64encode(encryptionPair.publicKey),
    secret_key: encryptionPair.secretKey,
  };
  const now = nowS();

  let rotation = null;
  if (previousSigning) {
    const statement = rotationStatement(previousSigning, signing, encryption);
    const message = `${PROTOCOL_V2}\nROTATION\n${canonicalJson(statement)}`;
    const signature = nacl.sign.detached(utf8(message), previousSigning.secret_key);
    rotation = {
      statement,
      signature: b64encode(signature),
    };
  }

  const statements = [
    db.prepare("UPDATE mak_server_keys SET status='RETIRED', retired_at=? WHERE status='ACTIVE' AND algorithm='ED25519'").bind(now),
    db.prepare("UPDATE mak_server_keys SET status='RETIRED', retired_at=? WHERE status='ACTIVE' AND algorithm='X25519'").bind(now),
    db.prepare(
      "INSERT INTO mak_server_keys (key_id,algorithm,public_key,secret_key,status,created_at) VALUES (?, 'ED25519', ?, ?, 'ACTIVE', ?)",
    ).bind(signing.key_id, signing.public_key, b64encode(signing.secret_key), now),
    db.prepare(
      "INSERT INTO mak_server_keys (key_id,algorithm,public_key,secret_key,status,created_at) VALUES (?, 'X25519', ?, ?, 'ACTIVE', ?)",
    ).bind(encryption.key_id, encryption.public_key, b64encode(encryption.secret_key), now),
  ];

  if (rotation) {
    statements.push(db.prepare(
      'INSERT INTO mak_server_key_rotations (previous_key_id,new_key_id,statement,signature,created_at) VALUES (?,?,?,?,?)',
    ).bind(
      previousSigning.key_id,
      signing.key_id,
      canonicalJson(rotation.statement),
      rotation.signature,
      now,
    ));
  }

  if (typeof db.batch === 'function') {
    await db.batch(statements);
  } else {
    for (const statement of statements) await statement.run();
  }
  invalidateKeyCache();

  return {
    signing_key_id: signing.key_id,
    signing_public_key: signing.public_key,
    encryption_key_id: encryption.key_id,
    encryption_public_key: encryption.public_key,
    rotated_from: previousSigning ? previousSigning.key_id : null,
    actor: String(options.actor || 'PANEL'),
    created_at: now,
  };
}
