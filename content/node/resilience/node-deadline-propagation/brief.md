The mobile app gives up after 3 seconds. Your API gateway waits 10 seconds
for the pricing service, which waits 30 seconds for the database. When the
database is slow, the user has long since seen an error — and your whole
stack is still busy computing an answer nobody will read, while fresh
requests queue up behind it.

The fix is to pass the **deadline** along with the request. Each service
knows how much time is *left*, uses no more than that for its own
downstream calls, and does not start work it cannot finish in time.

The details that matter:

- **Send a remaining budget, not a wall-clock time.** "You have 800 ms" means
  the same thing on every host; "finish by 12:00:00.800" depends on two
  machines' clocks agreeing, and they do not. (gRPC's `grpc-timeout` works
  this way.)
- **Subtract as you go.** The budget you forward is what is left *now*, minus
  a small margin for your own network hop and response — not what you
  received.
- **Cap what clients ask for.** A caller that sends a one-hour budget must
  not get to hold your resources for an hour.
- **Give up early.** If the budget is too small to be useful, or has run out
  by the time the answer arrives, say so (`504`) instead of doing or
  returning pointless work.

## Task

The header is `x-request-timeout-ms`: a whole number of milliseconds.

Export `readBudget(headers, { defaultMs = 10_000, maxMs = 30_000 } = {})`:
`headers` is a Node-style headers object. If the header matches `/^\d+$/`,
return its value capped at `maxMs`; otherwise (missing, empty, negative,
fractional, `'1e3'`, an array) return `defaultMs`.

Export `createDeadline(budgetMs, { now = Date.now } = {})`, fixing
`expiresAt = now() + budgetMs` at creation, returning:

- `remaining()` → `max(0, expiresAt - now())`;
- `expired()` → `remaining() === 0`;
- `child(capMs)` → a new deadline (same `now`) with budget
  `min(remaining(), capMs)` — for one downstream call that should not use
  the whole budget;
- `outgoingHeaders(marginMs = 0)` → `{ 'x-request-timeout-ms': String(max(0, remaining() - marginMs)) }`.

Export `createServer({ lookupPrice, now = Date.now, defaultMs = 10_000, maxMs = 30_000, marginMs = 20, minBudgetMs = 50 })`
returning an `http.Server` (not listening). `GET /price/<sku>`:

1. Read the budget from the request and create a deadline.
2. If `remaining() < minBudgetMs` → `504 { "error": "insufficient-deadline" }`,
   **without** calling `lookupPrice`.
3. `await lookupPrice(sku, { headers: deadline.outgoingHeaders(marginMs), deadline })`.
   If it throws → `502 { "error": "upstream-failed" }`.
4. If the deadline has expired by now → `504 { "error": "deadline-exceeded" }`
   (the caller has gone; do not pretend otherwise).
5. Otherwise `200 { "sku": <sku>, "price": <result> }`.

Anything else → `404 { "error": "not-found" }`. All responses are JSON.
