export function createRateLimiter({ capacity, refillPerSecond, now = Date.now }) {
  const buckets = new Map();

  return {
    check(key) {
      const timestamp = now();
      const bucket = buckets.get(key) ?? { tokens: capacity, lastRefill: timestamp };

      // Continuous refill: keep tokens fractional so partial time still counts.
      const elapsedSeconds = (timestamp - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillPerSecond);
      bucket.lastRefill = timestamp;

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        buckets.set(key, bucket);
        return {
          allowed: true,
          remaining: Math.floor(bucket.tokens),
          limit: capacity,
          retryAfterMs: 0,
        };
      }

      buckets.set(key, bucket);
      const deficit = 1 - bucket.tokens;
      return {
        allowed: false,
        remaining: 0,
        limit: capacity,
        retryAfterMs: Math.ceil((deficit / refillPerSecond) * 1000),
      };
    },
  };
}

export function rateLimit(limiter, keyOf = (req) => req.socket?.remoteAddress ?? 'anonymous') {
  return (req, res, next) => {
    const result = limiter.check(keyOf(req));

    res.setHeader('x-ratelimit-limit', String(result.limit));
    res.setHeader('x-ratelimit-remaining', String(result.remaining));

    if (result.allowed) return next();

    res.setHeader('retry-after', String(Math.ceil(result.retryAfterMs / 1000)));
    res.writeHead(429, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'too many requests' }));
  };
}
