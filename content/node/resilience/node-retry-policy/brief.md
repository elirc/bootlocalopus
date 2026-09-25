"Retry on failure" sounds harmless until it charges a card twice. A retry
policy for HTTP calls is really three separate questions, and most bugs come
from answering only the first:

1. **Is this failure transient?** A `503` or a reset connection might work
   next time; a `400` or a `404` never will, and a `500` usually means your
   request hit a bug that will hit it again.
2. **Is it safe to send again?** If the connection dropped *after* the server
   received a `POST /payments`, it may already have charged the card. Only
   **idempotent** methods — or requests carrying an idempotency key — may be
   replayed after an ambiguous failure. (Two failures are unambiguous: a
   refused connection never reached the server, and a `429` says it was not
   processed.)
3. **When?** If the server said `Retry-After`, obey it — retrying sooner is
   exactly the load it asked you not to send. If what it asks is longer than
   you can wait, give up now rather than wait or ignore it. Otherwise back off
   exponentially **with jitter**, so a thousand clients do not return in
   lock-step.

You met backoff and jitter in `js-retry-backoff`; this lesson is the
decision function in front of it.

## Task

Export `retryDecision(attempt, failure, options)` returning
`{ retry: true, delayMs }` or `{ retry: false, reason }`.

- `attempt` — how many attempts have been made so far (1 after the first failure).
- `failure` — `{ method, status, errorCode, headers = {}, idempotencyKey }`:
  either a response `status` or a network `errorCode` (like `'ECONNRESET'`).
  `headers` has lower-case names.
- `options` — `{ maxAttempts = 3, baseMs = 100, maxDelayMs = 10_000, now = Date.now, random = Math.random } = {}`.

Decide in this order:

1. `attempt >= maxAttempts` → `reason: 'attempts-exhausted'`.
2. Classify. **Safe** means the method (upper-cased) is `GET`, `HEAD`,
   `OPTIONS`, `PUT` or `DELETE`, or `idempotencyKey` is a non-empty string.

   | failure | retryable when |
   | --- | --- |
   | `errorCode` `'ECONNREFUSED'`, or `status` `429` | always |
   | `errorCode` `'ECONNRESET'`, `'ETIMEDOUT'`, `'EPIPE'`, `'EAI_AGAIN'`; `status` `408`, `502`, `503`, `504` | only if safe, else `reason: 'not-idempotent'` |
   | anything else (other codes, `500`, other `4xx`…) | never: `reason: 'not-retryable'` |

3. **`retry-after`** header present and valid:
   - all digits → that many **seconds**;
   - an HTTP date in the IMF-fixdate format that `toUTCString()` produces
     (`Wed, 21 Oct 2015 07:28:00 GMT`, i.e.
     `/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/`)
     → `Date.parse(value) - now()`, floored at 0;
   - anything else is ignored (fall through to backoff). Do not hand
     arbitrary strings to `Date.parse`: it happily reads `'-5'` and `'1.5'` as
     dates in 2001.

   A valid delay above `maxDelayMs` → `reason: 'retry-after-too-long'`;
   otherwise `{ retry: true, delayMs }` with exactly that delay.
4. **Backoff with full jitter**: `cap = min(maxDelayMs, baseMs * 2 ** (attempt - 1))`,
   `delayMs = Math.floor(random() * cap)`.
