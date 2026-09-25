The chapter boss: a pricing gateway in front of a flaky upstream, with every
tool from this chapter in the request path at once. On a good day it is a
proxy. On a bad day it must still answer every caller **within their
deadline**, never pile more load onto the struggling upstream than a fixed
retry budget allows, never let one slow SKU hold every worker, and prefer a
slightly stale price to an error page.

`node:http` and the global `fetch` only.

## Task

Export `createGateway(options)` returning `{ server }` (an `http.Server`, not
listening). Options and defaults:

| option | default | |
| --- | --- | --- |
| `upstream` | — | base URL, e.g. `http://127.0.0.1:4000` |
| `defaultMs`, `maxMs` | `2000`, `5000` | deadline default and cap |
| `marginMs`, `minBudgetMs` | `20`, `50` | |
| `maxConcurrent` | `4` | the bulkhead |
| `maxAttempts`, `baseMs` | `3`, `50` | retries |
| `retryRatio`, `minRetries`, `retryWindowMs` | `0.1`, `3`, `10_000` | the retry budget |
| `now`, `sleep`, `random` | `Date.now`, a `setTimeout` promise, `Math.random` | injected for tests |

Every response is JSON. **`GET /quote/<sku>`** (`<sku>` matching
`[A-Za-z0-9_-]+`; anything else → `404 { "error": "not-found" }`):

1. **Deadline.** Read `x-request-timeout-ms` exactly as in the deadline
   lesson (digits only, capped at `maxMs`, else `defaultMs`). If fewer than
   `minBudgetMs` remain → `504 { "error": "insufficient-deadline" }`.
2. **Bulkhead.** If `maxConcurrent` quotes are already being looked up live →
   `503 { "error": "busy" }` with `retry-after: 1`, at once. A lookup holds its
   slot through all its attempts and retries.
3. **Live lookup.** Record one request in the retry budget. Each attempt is
   `GET <upstream>/price/<sku>` with header `x-request-timeout-ms:
   max(0, remaining - marginMs)`, aborted when the deadline runs out.
   - `200` with a JSON body whose `price` is a number → success.
   - `404` → answer `404 { "error": "unknown-sku" }` right away (no retry, no
     fallback: the upstream is healthy, the SKU does not exist).
   - `429`, `502`, `503`, `504`, or a network error that is **not** your own
     deadline abort → retryable. Anything else (a `500`, a bad body, the
     deadline abort) → stop.
   - A retry needs **all** of: `attempt < maxAttempts`; a delay (the
     upstream's `retry-after` in whole seconds if it sent one, else
     `Math.floor(random() * baseMs * 2 ** (attempt - 1))`) with
     `delay + minBudgetMs <= remaining`; and then the retry budget granting it
     (same rules as the retry-budget lesson: at most
     `max(minRetries, floor(retryRatio × requests))` retries in the last
     `retryWindowMs`). Then `await sleep(delay)`.
4. **Answer.** Success → `200 { sku, price, source: "live" }`, and remember
   the price for that SKU. Otherwise, a remembered price →
   `200 { sku, price, source: "stale" }`; else the deadline has run out →
   `504 { "error": "deadline-exceeded" }`; else `502 { "error": "upstream-failed" }`.
