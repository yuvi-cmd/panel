// NexonCheat (com.bgmi) login transport.
//
// The APK posts to /validbool with the same envelope implemented here:
//
//   request : p1=<b64url(IV12 || TAG16 || AES-256-GCM(json))>&p2=<hex hmac>
//   response: <b64url(IV12 || TAG16 || AES-256-GCM(json))>.<hex hmac>
//
// Request JSON  : {"k":"<key>","d":"<device-uuid>","t":<epoch>,"pkg":"com.bgmi"}
// Response JSON : {"q":<status>, ...}   q=7 is a successful login.
//
// The status codes below are what the APK's native Check() switch maps to its
// user-facing messages (see /nexon docs in README):
//   1 server under maintenance, 2 key expired, 3 max devices,
//   4 invalid key, 5 wrong app, 6 blocked, 7 success.
//
// AES/HMAC keys are compiled into libshaitaan.so. They are protocol constants,
// not per-panel secrets; env overrides exist so a future APK can rotate them
// without a code change.
import { verifyKey, ensureApkBootstrapKey } from './connect.js';

const DEFAULT_AES_KEY_HEX =
  '5c3d9f2a8b1e4c6079d2f3a4b5c6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8';
const DEFAULT_HMAC_KEY = 'X9kL2mQ7vR4nB1eY3pT8wS5uJ6dA0cF';

// The APK's success handler stores `x` and XORs it with this constant to get
// the expiry epoch. `x == STATUS_MAGIC` means "never expires".
const STATUS_MAGIC = 0xb7e15163;

const Q = {
  MAINTENANCE: 1,
  EXPIRED: 2,
  MAX_DEVICE: 3,
  INVALID: 4,
  WRONG_APP: 5,
  BLOCKED: 6,
  OK: 7,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64_RE = /^[0-9a-f]{64}$/i;

const clean = (v, max = 255) =>
  (typeof v === 'string' && v.trim() !== '' && v.trim().length <= max) ? v.trim() : '';

function hexToBytes(hex) {
  const s = String(hex || '');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function b64uEncode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(text) {
  let s = String(text || '').trim();
  if (!s || s.length > 8192) return null;
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  try {
    const bin = atob(s + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// Constant-time compare for the hex HMAC (length is public anyway).
function safeEqual(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

function aesKeyHex(env) {
  const v = env && typeof env.NEXON_AES_KEY === 'string' ? env.NEXON_AES_KEY.trim() : '';
  return /^[0-9a-fA-F]{64}$/.test(v) ? v : DEFAULT_AES_KEY_HEX;
}

function hmacKey(env) {
  const v = env && typeof env.NEXON_HMAC_KEY === 'string' ? env.NEXON_HMAC_KEY : '';
  return v || DEFAULT_HMAC_KEY;
}

async function hmacHex(env, text) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(hmacKey(env)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(text)));
  return bytesToHex(new Uint8Array(sig));
}

async function gcmDecrypt(env, p1) {
  const raw = b64uDecode(p1);
  if (!raw || raw.length < 29) return '';
  const iv = raw.slice(0, 12);
  const tag = raw.slice(12, 28);
  const ct = raw.slice(28);
  const ctTag = new Uint8Array(ct.length + 16);
  ctTag.set(ct, 0);
  ctTag.set(tag, ct.length);
  const key = await crypto.subtle.importKey(
    'raw', hexToBytes(aesKeyHex(env)), { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ctTag);
  return new TextDecoder().decode(pt);
}

async function gcmEncrypt(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    'raw', hexToBytes(aesKeyHex(env)), { name: 'AES-GCM' }, false, ['encrypt']);
  const out = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 }, key, new TextEncoder().encode(String(text))));
  const tag = out.slice(out.length - 16);
  const ct = out.slice(0, out.length - 16);
  const blob = new Uint8Array(28 + ct.length);
  blob.set(iv, 0);
  blob.set(tag, 12);
  blob.set(ct, 28);
  return b64uEncode(blob);
}

async function seal(env, obj) {
  const p1 = await gcmEncrypt(env, JSON.stringify(obj));
  const p2 = await hmacHex(env, p1);
  return p1 + '.' + p2;
}

function randomHex(nbytes) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(nbytes)));
}

function randomInt() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// Decoy fields present in the original /validbool response. The APK's Check()
// only reads q and x, but keeping the same shape makes the endpoint
// indistinguishable from the live server to traffic inspection.
function statusBody(q, x = STATUS_MAGIC) {
  return {
    q,
    x,
    z: randomInt(),
    w: 100000 + (randomInt() % 900000),
    u: randomHex(5),
    v: randomHex(4),
  };
}

function codeForVerifyError(err) {
  const s = String(err || '').toUpperCase();
  if (s.includes('BLOCK')) return Q.BLOCKED;
  if (s.includes('EXPIRE')) return Q.EXPIRED;
  if (s.includes('MAX DEVICE')) return Q.MAX_DEVICE;
  return Q.INVALID;
}

// "YYYY-MM-DD HH:MM:SS" (DB, UTC) or an ISO string -> epoch ms, 0 if invalid.
function parseDbTime(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return 0;
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
  let ms = Date.parse(iso);
  if (isNaN(ms)) ms = Date.parse(s);
  return isNaN(ms) ? 0 : ms;
}

function maxSkewSeconds(env) {
  const v = env && Number(env.NEXON_MAX_SKEW);
  if (Number.isFinite(v) && v >= 0) return Math.floor(v);
  return 86400;
}

function formValue(body, name) {
  for (const part of String(body || '').split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq) !== name) continue;
    const raw = part.slice(eq + 1);
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return '';
}

export async function handleNexon(request, db, panel, env, ctx) {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  let logKey = '';
  let logDev = '';
  const headers = {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
    ...cors,
  };

  const reply = async (obj) => {
    try {
      const hit = db.prepare('INSERT INTO nexon_hits (panel_code,key_value,device_uuid,q,user_agent) VALUES (?,?,?,?,?)')
        .bind(String(panel || ''), logKey, logDev, Number(obj && obj.q) || 0, String(request.headers.get('user-agent') || '').slice(0, 300))
        .run().catch(() => {});
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(hit);
      else await hit;
    } catch {}
    try {
      return new Response(await seal(env, obj), { status: 200, headers });
    } catch (e) {
      try { console.error('nexon seal failed:', (e && e.stack) || e); } catch {}
      return new Response('', { status: 500, headers: { 'Cache-Control': 'no-store', ...cors } });
    }
  };
  const fail = (q) => reply(statusBody(q));

  if (request.method.toUpperCase() !== 'POST') {
    return new Response(JSON.stringify({ status: false, reason: 'METHOD NOT ALLOWED' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
    });
  }

  panel = clean(panel, 20);
  if (!panel) return fail(Q.INVALID);

  let bodyText = '';
  try { bodyText = await request.text(); } catch { return fail(Q.INVALID); }

  const p1 = formValue(bodyText, 'p1').trim();
  const p2 = formValue(bodyText, 'p2').trim().toLowerCase();
  if (!p1 || !HEX64_RE.test(p2)) return fail(Q.INVALID);

  // p2 signs the ASCII text of p1 (verified against the live server).
  let expected;
  try { expected = await hmacHex(env, p1); } catch { return fail(Q.INVALID); }
  if (!safeEqual(expected, p2)) return fail(Q.INVALID);

  let payload;
  try { payload = JSON.parse(await gcmDecrypt(env, p1)); } catch { return fail(Q.INVALID); }
  if (!payload || typeof payload !== 'object') return fail(Q.INVALID);

  const k = clean(payload.k, 100);
  const d = clean(payload.d, 64);
  logKey = k;
  logDev = d;
  if (!k || !UUID_RE.test(d)) return fail(Q.INVALID);

  // A key issued for another package mirrors the APK's "bound to a different
  // app" state. The Nexon build always sends com.bgmi.
  const pkg = clean(payload.pkg, 50);
  if (pkg && pkg !== 'com.bgmi') return fail(Q.WRONG_APP);

  const ts = Number(payload.t);
  const skew = maxSkewSeconds(env);
  if (!Number.isFinite(ts) || ts <= 0) return fail(Q.INVALID);
  if (skew > 0 && Math.abs(Math.floor(Date.now() / 1000) - ts) > skew) return fail(Q.INVALID);

  try {
    // Same one-time bootstrap as /connect: the main panel's own code works as
    // the first APK key without manually creating one in the panel UI.
    if (k === panel) await ensureApkBootstrapKey(db, panel, env);

    const prow = await db.prepare('SELECT is_active FROM panels WHERE panel_code=?')
      .bind(panel).first().catch(() => null);
    if (!prow || (prow.is_active | 0) !== 1) return fail(Q.INVALID);

    const mnt = await db.prepare('SELECT is_active FROM mod_maintenance WHERE panel_code=?')
      .bind(panel).first().catch(() => null);
    if (mnt && (mnt.is_active | 0) === 1) return fail(Q.MAINTENANCE);

    const v = await verifyKey(db, panel, k, d);
    if (v.err) return fail(codeForVerifyError(v.err));

    const expMs = parseDbTime(v.expiry);
    if (expMs <= 0) return fail(Q.INVALID);
    if (expMs <= Date.now()) return fail(Q.EXPIRED);

    // x = STATUS_MAGIC XOR expiry_epoch. The APK detects "never expires" when
    // x equals STATUS_MAGIC exactly, otherwise it formats localtime(x ^ magic).
    const epoch = Math.floor(expMs / 1000);
    const x = epoch > 0 && epoch <= 253402300799
      ? Number(BigInt(STATUS_MAGIC) ^ BigInt(epoch))
      : STATUS_MAGIC;

    return reply(statusBody(Q.OK, x));
  } catch (e) {
    try { console.error('nexon error:', (e && e.stack) || e); } catch {}
    return fail(Q.INVALID);
  }
}
