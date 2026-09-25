Retries are load. When a dependency is healthy and one call in a thousand
fails, a retry is free. When it is **overloaded** and every call fails, "try
up to 3 times" means you now send it **three times** the traffic that
overloaded it. Stack three services that each retry three times and the
bottom one sees 27×. Retries turn a brownout into an outage that cannot
recover on its own — a **retry storm**.

A per-request attempt limit cannot see this; it only knows about its own
request. A **retry budget** looks at the whole client: retries may be at most
a fixed fraction — say 10% — of the requests made in the last few seconds.
While things are healthy, the few requests that fail all get their retry.
When everything fails, retries are capped at +10% load instead of +200%.
(Google's SRE book and Envoy's `retry_budget` both work this way; a small
floor keeps a quiet client from having no budget at all.)

## Task

Export `createRetryBudget({ ratio = 0.1, minRetries = 10, windowMs = 10_000, now = Date.now } = {})`
returning:

- **`recordRequest()`** — note one original request (not a retry) at `now()`.
- **`tryRetry()`** — if the retries in the window are fewer than
  `max(minRetries, Math.floor(ratio * requestsInWindow))`, record a retry at
  `now()` and return `true`; otherwise return `false` and record nothing.
- **`stats()`** → `{ requests, retries }` counted over the window.

The window is the last `windowMs` milliseconds: an event recorded at time
`t` counts while `now() - t < windowMs`. Drop events once they leave the window
— this object lives as long as the process. `now()` never goes backwards.

Export `async callWithBudget(fn, { budget, maxAttempts = 3, shouldRetry = () => true, delayMs = () => 0, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) })`:

1. `budget.recordRequest()` once, then call `await fn(attempt)` with
   `attempt` starting at 1, and return its value if it succeeds.
2. On a failure, retry only if **all** hold, checked in this order:
   `attempt < maxAttempts`, `shouldRetry(error)`, then `budget.tryRetry()`.
   (Ask the budget last: a request that would not retry anyway must not spend
   it.) Before retrying, `await sleep(delayMs(attempt))`.
3. Otherwise rethrow that failure's error, unchanged.
