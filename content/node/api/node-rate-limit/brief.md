A fixed window (`60 requests per minute`) is simple but lets a client
send 120 requests across a window boundary. A **sliding window** or **token
bucket** smooths that out. You will build a token bucket, which also allows a
sensible burst.

## Task

Export `createRateLimiter({ capacity, refillPerSecond, now = Date.now })`
returning `{ check(key) }`.

`check` returns
`{ allowed, remaining, limit, retryAfterMs }`:

- each key gets its own bucket, starting full
- an allowed request costs one token
- tokens refill continuously at `refillPerSecond` (fractional time counts —
  half a second at 2/s is one token), never exceeding `capacity`
- when refused, `retryAfterMs` is the whole milliseconds until one token is
  available; `0` when allowed
- `remaining` is the floor of the tokens left

Then export `rateLimit(limiter, keyOf)`: middleware
`(req, res, next)` that sets `x-ratelimit-limit` and
`x-ratelimit-remaining` on every response, and on refusal responds `429` with
a `retry-after` header **in seconds** (rounded up) and body
`{"error":"too many requests"}`.

Two things this in-memory version leaves out, which a production one must
handle:

- **Eviction.** One bucket per key, never removed, is a memory leak keyed by
  attacker-controlled input. Drop buckets that have refilled to full (they
  carry no information), or use a store with a TTL such as Redis.
- **Which IP.** Behind a proxy or load balancer, `req.socket.remoteAddress` is
  the proxy. The client is in `X-Forwarded-For` — but only trust that header
  when the request really came through your proxy (Express calls this
  `trust proxy`), or anyone can send a fresh fake IP per request.
