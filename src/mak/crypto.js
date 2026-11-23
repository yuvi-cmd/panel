// MAK/1 cryptography helpers — WebCrypto + TweetNaCl Ed25519.
// No static AES/master secret lives here. Server signing seeds are Worker
// secrets (MAK_SIGNING_KEY / MAK_SIGNING_KEYS). MAK credentials are stored as
// SHA-256 verifiers only.

import nacl from 'tweetnacl';

const TE = new TextEncoder();
const TD = new TextDecoder();

export const PROTOCOL = 'MAK/1';
export const PROTOCOL_V2 = 'MAK/2';
export const MAK_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function utf8(s) { return TE.encode(String(s)); }
export function fromUtf8(b) { return TD.decode(b); }

export function randomBytes(n) {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const s = String(hex || '').replace(/[^0-9a-f]/gi, '');
  if (s.length % 2) throw new Error('Invalid hex');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function b64encode(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) bin += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function b64decode(value) {
  let s = String(value || '').trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  if (!s) return new Uint8Array(0);
  s = s.replace(/=+$/, '');
  while (s.length % 4) s += '=';
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

export function b64url(bytes) {
  return b64encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomId(prefix = '', bytes = 18) {
  return (prefix ? prefix + '_' : '') + b64url(randomBytes(bytes));
}

export async function sha256Bytes(data) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? utf8(data) : data));
}

export async function sha256Hex(data) {
  return bytesToHex(await sha256Bytes(data));
}

// ---------------------------------------------------------------------------
// Canonical JSON: lexicographically sorted object keys, compact output.
// This is the exact representation we sign. Objects must not contain
// undefined / functions / bigint values.
// ---------------------------------------------------------------------------
export function canonicalJson(value) {
  const walk = (v) => {
    if (v === null) return 'null';
    if (v === true) return 'true';
    if (v === false) return 'false';
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error('Non-finite number');
      return JSON.stringify(v);
    }
    if (typeof v === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(walk).join(',') + ']';
    if (typeof v === 'object') {
      const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + walk(v[k])).join(',') + '}';
    }
    throw new Error('Unsupported canonical JSON value');
  };
  return walk(value);
}

export function safeEqual(a, b) {
  const x = utf8(String(a));
  const y = utf8(String(b));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// MAK credentials
// ---------------------------------------------------------------------------
export function generateMak() {
  const bytes = randomBytes(20);
  let raw = '';
  for (let i = 0; i < 20; i++) raw += MAK_ALPHABET[bytes[i] & 31];
  return 'MAK-' + raw.slice(0, 5) + '-' + raw.slice(5, 10) + '-' + raw.slice(10, 15) + '-' + raw.slice(15, 20);
}

// Accepts "MAK-XXXXX-...", lowercase, missing dashes, or extra whitespace.
export function canonicalMak(value) {
  let s = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (s.startsWith('MAK-')) s = s.slice(4);
  else if (s.startsWith('MAK')) s = s.slice(3);
  s = s.replace(/[^0-9A-Z]/g, '');
  if (s.length !== 20) return '';
  if ([...s].some((c) => !MAK_ALPHABET.includes(c))) return '';
  return 'MAK-' + s.slice(0, 5) + '-' + s.slice(5, 10) + '-' + s.slice(10, 15) + '-' + s.slice(15, 20);
}

export async function makHash(canonical) {
  return sha256Hex('MAK-VERIFIER-V1|' + canonical);
}

// Incoming MAKs can be a generated canonical key or any custom secret the
// operator chose. Try the canonical form first so lowercase/missing-dash
// variants of generated keys still resolve, then the exact trimmed string.
export function makCredentialVariants(value) {
  const raw = String(value || '').trim().slice(0, 120);
  const out = [];
  const canonical = canonicalMak(raw);
  if (canonical) out.push(canonical);
  if (raw && !out.includes(raw)) out.push(raw);
  return out;
}

export function generateLicenseUid() {
  const bytes = randomBytes(10);
  let raw = '';
  for (let i = 0; i < 10; i++) raw += MAK_ALPHABET[bytes[i] & 31];
  return 'LIC-' + raw.slice(0, 5) + '-' + raw.slice(5, 10);
}

// ---------------------------------------------------------------------------
// Password hashing — PBKDF2-SHA256 (Worker + Node).
// ---------------------------------------------------------------------------
const PBKDF2_ITERATIONS = 120000;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await crypto.subtle.importKey('raw', utf8(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${b64encode(salt)}$${b64encode(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 10000 || iterations > 1000000) return false;
  const salt = b64decode(parts[2]);
  const expected = b64decode(parts[3]);
  if (!salt.length || !expected.length) return false;
  try {
    const key = await crypto.subtle.importKey('raw', utf8(String(password)), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      key,
      expected.length * 8,
    ));
    if (bits.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Server signing key ring (Ed25519)
// ---------------------------------------------------------------------------
function seedFromEnv(value) {
  const raw = b64decode(value);
  if (raw.length === 32) return raw;
  const hex = String(value || '').trim();
  if (/^[0-9a-f]{64}$/i.test(hex)) return hexToBytes(hex);
  return null;
}

export function loadSigningConfig(env) {
  const signingKeysRaw = String(env?.MAK_SIGNING_KEYS || '').trim();
  const singleRaw = String(env?.MAK_SIGNING_KEY || '').trim();
  const activeEnv = String(env?.MAK_SIGNING_KEY_ID || '').trim();
  const cacheKey = `${signingKeysRaw}|${singleRaw}|${activeEnv}`;
  const cached = globalThis.__makSigningCache;
  if (cached && cached.cacheKey === cacheKey) return cached.config;

  let entries = [];
  if (signingKeysRaw) {
    try {
      const parsed = JSON.parse(signingKeysRaw);
      if (Array.isArray(parsed)) {
        entries = parsed.map((x) => ({
          key_id: String(x.key_id || x.keyId || x.id || '').trim(),
          seed: String(x.seed || x.key || x.private_key || '').trim(),
        }));
      }
    } catch {
      const config = { ok: false, reason: 'MAK_SIGNING_KEYS is not valid JSON', keys: [], active: null };
      globalThis.__makSigningCache = { cacheKey, config };
      return config;
    }
  }
  if (!entries.length && singleRaw) {
    entries = [{ key_id: activeEnv || 'MAK-ED25519-01', seed: singleRaw }];
  }

  const keys = [];
  for (const e of entries) {
    if (!e.key_id || !/^[A-Za-z0-9._:-]{3,64}$/.test(e.key_id)) continue;
    const seed = seedFromEnv(e.seed);
    if (!seed) continue;
    const pair = nacl.sign.keyPair.fromSeed(seed);
    keys.push({
      key_id: e.key_id,
      public_key: b64encode(pair.publicKey),
      secret_key: pair.secretKey,
      seed,
    });
  }
  if (!keys.length) {
    const config = {
      ok: false,
      reason: singleRaw || signingKeysRaw ? 'Signing key is invalid (expected base64 32-byte seed or 64-char hex)' : 'MAK_SIGNING_KEY is not configured',
      keys: [],
      active: null,
    };
    globalThis.__makSigningCache = { cacheKey, config };
    return config;
  }
  const active = keys.find((k) => k.key_id === activeEnv) || keys[keys.length - 1];
  const config = { ok: true, reason: '', keys, active };
  globalThis.__makSigningCache = { cacheKey, config };
  return config;
}

export function signingPublicKeys(config) {
  if (!config?.ok) return [];
  return config.keys.map((k) => ({ key_id: k.key_id, public_key: k.public_key, active: k.key_id === config.active.key_id }));
}

export function signWithProtocol(payload, config, protocol, domain = 'RESPONSE') {
  if (!config?.ok || !config.active) throw new Error('Signing key not configured');
  const body = { ...payload, key_id: config.active.key_id };
  const message = `${protocol}\n${domain}\n${canonicalJson(body)}`;
  const signature = nacl.sign.detached(utf8(message), config.active.secret_key);
  return { ...body, signature: b64encode(signature) };
}

export function verifyWithProtocol(signed, config, protocol, domain = 'RESPONSE') {
  if (!signed || typeof signed !== 'object' || !signed.signature) return false;
  const key = config?.keys?.find((k) => k.key_id === signed.key_id);
  if (!key) return false;
  const { signature, ...body } = signed;
  const message = `${protocol}\n${domain}\n${canonicalJson(body)}`;
  try {
    return nacl.sign.detached.verify(utf8(message), b64decode(signature), b64decode(key.public_key));
  } catch {
    return false;
  }
}

export function signPayload(payload, config, domain = 'RESPONSE') {
  return signWithProtocol(payload, config, PROTOCOL, domain);
}

export function verifySignedPayload(signed, config, domain = 'RESPONSE') {
  if (!signed || typeof signed !== 'object' || !signed.signature) return false;
  const key = config?.keys?.find((k) => k.key_id === signed.key_id);
  if (!key) return false;
  const { signature, ...body } = signed;
  const message = `${PROTOCOL}\n${domain}\n${canonicalJson(body)}`;
  try {
    return nacl.sign.detached.verify(utf8(message), b64decode(signature), b64decode(key.public_key));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Device identity: ECDSA P-256, SHA-256 signatures.
// Public keys are normalised to SPKI DER and stored as "spki:<base64>".
// Signatures accept Android DER (SHA256withECDSA) or raw r||s (64 bytes).
// ---------------------------------------------------------------------------
const P256_SPKI_PREFIX = hexToBytes('3059301306072a8648ce3d020106082a8648ce3d030107034200');

function rawEcdsaToDer(sig) {
  if (sig.length !== 64) return null;
  const trim = (part) => {
    let i = 0;
    while (i < part.length - 1 && part[i] === 0) i++;
    let out = part.slice(i);
    if (out[0] & 0x80) out = Uint8Array.from([0, ...out]);
    return out;
  };
  const r = trim(sig.slice(0, 32));
  const s = trim(sig.slice(32));
  const body = Uint8Array.from([0x02, r.length, ...r, 0x02, s.length, ...s]);
  return Uint8Array.from([0x30, body.length, ...body]);
}

function derEcdsaToRaw(der) {
  if (!der || der.length < 8 || der[0] !== 0x30) return null;
  let offset = 1;
  let length = der[offset++];
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count < 1 || count > 2) return null;
    length = 0;
    for (let i = 0; i < count; i++) length = (length << 8) | der[offset++];
  }
  if (offset + length !== der.length) return null;
  if (der[offset++] !== 0x02) return null;
  const rLen = der[offset++];
  if (!rLen || offset + rLen > der.length) return null;
  const r = der.slice(offset, offset + rLen);
  offset += rLen;
  if (der[offset++] !== 0x02) return null;
  const sLen = der[offset++];
  if (!sLen || offset + sLen !== der.length) return null;
  const s = der.slice(offset, offset + sLen);
  const pad = (part) => {
    let i = 0;
    while (i < part.length - 1 && part[i] === 0) i++;
    const out = part.slice(i);
    if (out.length > 32) return null;
    const padded = new Uint8Array(32);
    padded.set(out, 32 - out.length);
    return padded;
  };
  const rr = pad(r);
  const ss = pad(s);
  if (!rr || !ss) return null;
  return Uint8Array.from([...rr, ...ss]);
}

export function normalizeDevicePublicKey(value) {
  let s = String(value || '').trim();
  let kind = '';
  if (s.startsWith('spki:')) { kind = 'spki'; s = s.slice(5); }
  else if (s.startsWith('raw:')) { kind = 'raw'; s = s.slice(4); }
  let bytes = b64decode(s);
  if (!bytes.length) return { ok: false, error: 'empty public key' };

  if (!kind) {
    if (bytes.length === 65 && bytes[0] === 0x04) kind = 'raw';
    else if (bytes.length > 65 && bytes[0] === 0x30) kind = 'spki';
    else return { ok: false, error: 'unsupported public key encoding' };
  }

  if (kind === 'raw') {
    if (bytes.length !== 65 || bytes[0] !== 0x04) return { ok: false, error: 'invalid uncompressed P-256 point' };
    bytes = Uint8Array.from([...P256_SPKI_PREFIX, ...bytes]);
  } else if (bytes.length < 65 || bytes[0] !== 0x30) {
    return { ok: false, error: 'invalid SPKI DER' };
  }

  const spkiB64 = b64encode(bytes);
  return { ok: true, spkiB64, storage: 'spki:' + spkiB64, spki: bytes };
}

export async function fingerprintDevicePublicKey(normalized) {
  return 'SHA256:' + (await sha256Hex(normalized.spki)).toUpperCase();
}

export async function verifyDeviceProof(publicKeyValue, message, signatureB64) {
  const norm = normalizeDevicePublicKey(publicKeyValue);
  if (!norm.ok) return { ok: false, error: norm.error };
  const sig = b64decode(signatureB64);
  if (!sig.length) return { ok: false, error: 'empty signature', normalized: norm };

  // WebCrypto uses raw r||s, while Android's SHA256withECDSA emits DER.
  // Accept both by trying the wire form and its counterpart.
  const candidates = [];
  if (sig.length === 64) {
    candidates.push(sig);
    const der = rawEcdsaToDer(sig);
    if (der) candidates.push(der);
  } else if (sig[0] === 0x30) {
    const raw = derEcdsaToRaw(sig);
    if (raw) candidates.push(raw, sig);
  } else {
    candidates.push(sig);
  }

  try {
    const key = await crypto.subtle.importKey(
      'spki', norm.spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    for (const candidate of candidates) {
      try {
        if (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, candidate, utf8(message))) {
          return { ok: true, normalized: norm };
        }
      } catch {
        // Try the next encoding.
      }
    }
    return { ok: false, error: 'invalid ECDSA signature', normalized: norm };
  } catch (e) {
    return { ok: false, error: 'device key verification failed', normalized: norm };
  }
}

export function deviceProofMessage(kind, fields) {
  return `${PROTOCOL}\n${String(kind).toUpperCase()}\n${fields.map((x) => String(x ?? '')).join('\n')}`;
}

// ---------------------------------------------------------------------------
// Misc validation helpers
// ---------------------------------------------------------------------------
export function normalizeHex64(value) {
  const s = String(value || '').trim().toLowerCase().replace(/^sha256:/, '').replace(/[^0-9a-f]/g, '');
  return s.length === 64 ? s : '';
}

export function validPackageName(value) {
  const s = String(value || '').trim();
  if (s.length < 3 || s.length > 200) return '';
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(s)) return '';
  return s;
}

export function clampInt(value, min, max, fallback) {
  const n = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function nowS() { return Math.floor(Date.now() / 1000); }

// ---------------------------------------------------------------------------
// MAK/2 identifiers and encrypted-envelope helpers
// ---------------------------------------------------------------------------
export function generateGrantId() {
  return 'GRT-' + bytesToHex(randomBytes(12)).toUpperCase();
}

export function generateTicketId(prefix = 'TKT') {
  return String(prefix).toUpperCase() + '-' + bytesToHex(randomBytes(12)).toUpperCase();
}

export function secureEqualBytes(a, b) {
  const x = a instanceof Uint8Array ? a : new Uint8Array(a || []);
  const y = b instanceof Uint8Array ? b : new Uint8Array(b || []);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function hkdfSha256(ikm, salt, info, length = 32) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// Server static X25519 keypair for the NaCl box envelope. The secret is a
// Worker secret (MAK_ENC_KEY); the public key is safe to publish.
export function loadEncryptionConfig(env) {
  const raw = String(env?.MAK_ENC_KEY || '').trim();
  const keyId = String(env?.MAK_ENC_KEY_ID || 'MAK-ENC-01').trim();
  const cached = globalThis.__makEncryptionCache;
  if (cached && cached.raw === raw && cached.keyId === keyId) return cached.config;

  let secret = null;
  if (raw) {
    const b64 = b64decode(raw);
    if (b64.length === 32) secret = b64;
    else if (/^[0-9a-f]{64}$/i.test(raw)) secret = hexToBytes(raw);
  }
  let config;
  if (!secret) {
    config = { ok: false, reason: raw ? 'MAK_ENC_KEY must be a base64/hex 32-byte X25519 secret' : 'MAK_ENC_KEY is not configured', key_id: keyId };
  } else {
    const pair = nacl.box.keyPair.fromSecretKey(secret);
    config = {
      ok: true,
      key_id: keyId,
      secret_key: pair.secretKey,
      public_key: b64encode(pair.publicKey),
    };
  }
  globalThis.__makEncryptionCache = { raw, keyId, config };
  return config;
}

export async function hashIp(ip, env) {
  const salt = String(env?.IP_HASH_SALT || 'mak-ip-v1');
  return (await sha256Hex(salt + '|' + String(ip || 'unknown'))).slice(0, 32);
}
