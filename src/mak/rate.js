// Per-isolate fixed-window limiter. Cloudflare may run many isolates, so this
// is a burst guard, not a global quota. Cryptographic verification is still
// mandatory on every request.

const buckets = new Map();

function sweep(now) {
  if (buckets.size < 2000) return;
  for (const [key, b] of buckets) {
    if (b.reset <= now) buckets.delete(key);
  }
}

export function hitRate(key, limit, windowMs) {
  const now = Date.now();
  sweep(now);
  const k = String(key);
  let b = buckets.get(k);
  if (!b || b.reset <= now) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(k, b);
  }
  b.count++;
  return {
    allowed: b.count <= limit,
    remaining: Math.max(0, limit - b.count),
    retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)),
  };
}

export function rateHeaders(result) {
  return {
    'X-RateLimit-Remaining': String(result.remaining ?? 0),
    ...(result.allowed ? {} : { 'Retry-After': String(result.retryAfter || 60) }),
  };
}
