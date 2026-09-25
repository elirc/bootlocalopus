A retry loop is three lines, and the naive one hurts in production:

- it retries **everything**, so a `404` or a `422` validation error is sent
  four times and the user waits for all of them before seeing "not found";
- it retries **immediately**, so when the API falls over, every client hits
  it again at once and keeps it down (retry with **exponential backoff**:
  wait longer after each failure);
- it ignores `429 Too Many Requests` and its `Retry-After`;
- it keeps retrying after the user has **left the page**.

## Task

1. Export `fetchWithRetry(request, options)`, where `request({ signal })`
   returns a promise, and `options` is
   `{ retries = 3, baseDelay = 500, sleep = defaultSleep, signal, onRetry }`:

   - call `request({ signal })`; if it resolves, return its value.
   - if it rejects, decide whether to retry. An error is **retryable** when
     it has no `status` (a network failure), or `status >= 500`, or
     `status === 429`. Anything else (`400`, `404`, `422`, …) is thrown
     **immediately**.
   - retry at most `retries` times (so at most `retries + 1` calls). After
     the last failure, throw **that** error.
   - before retry number `n` (0 for the first retry), wait
     `baseDelay * 2 ** n` ms by `await sleep(ms, signal)`: 500, 1000, 2000 by
     default. For a `429` whose error has a numeric `retryAfter` (seconds),
     wait `retryAfter * 1000` instead.
   - just before each wait, call `onRetry({ attempt, delay, error })` if
     given, where `attempt` is the number of the call about to be made
     (2 for the first retry).
   - `signal` (an `AbortSignal`, optional): if it is aborted before a call or
     while waiting, stop and throw `signal.reason`. No further calls.

   Export `defaultSleep(ms, signal)` too: resolves after `ms` using
   `setTimeout`, and rejects with `signal.reason` as soon as the signal
   aborts (clearing the timer).

2. Export `OrderStatus({ orderId, loadOrder, sleep })` that loads with
   `fetchWithRetry(({ signal }) => loadOrder(orderId, signal), { sleep, signal, onRetry })`
   in an effect and renders:
   - `<p>Loading…</p>` on the first attempt
   - `<p>Retrying (attempt {attempt} of 4)…</p>` while retrying
   - `<p>Status: {order.status}</p>` on success
   - `<p role="alert">Could not load order</p>` on failure
   - when the component unmounts or `orderId` changes, abort the old
     attempt: no more calls for the old order, and nothing it resolves is
     shown.
