export function createRateLimiter({ capacity, refillPerSecond, now = Date.now }) {
  const buckets = new Map();

  return {
    check(key) {
      // TODO
    },
  };
}

export function rateLimit(limiter, keyOf = (req) => req.socket?.remoteAddress ?? 'anonymous') {
  return (req, res, next) => {
    // TODO
    // (This stub answers 501 so the tests fail fast instead of hanging.)
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  };
}
