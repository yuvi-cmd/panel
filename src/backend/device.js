// Device fingerprint — SHA-256 over device-info + UA. Used for login device
// binding (users.device_fingerprint) and /api device locks.

// SHA-256 hex via WebCrypto (login fingerprint ke liye, PHP hash() parity)
export async function sha256HexStr(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function deviceFingerprint(diJson, ua, lang) {
  let d = {};
  try { d = JSON.parse(diJson || '{}'); } catch {}
  const s = (d.screen || '') + '|' + (d.timezone || '') + '|' + (d.platform || '') + '|' + (d.canvas || '') + '|' + (d.webgl || '') + '|' + (d.audio || '') + '|' + (ua || '') + '|' + (lang || '');
  return sha256HexStr(s);
}
