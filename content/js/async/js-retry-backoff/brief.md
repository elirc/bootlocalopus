A retry policy has four decisions: how many times, how long between,
which errors are worth retrying, and how to give up early.

There is a fifth that only shows up in production. If a dependency blips and a
thousand clients all retry after exactly 100 ms, then 200 ms, then 400 ms, they
arrive in synchronised waves and knock it over again. **Jitter** — randomising
each delay, e.g. "full jitter" `Math.random() * delay` — spreads them out. The
tests need deterministic delays, so jitter is a hook here: the policy computes
the delay, `jitter` gets the final say.

## Task

Export `retry(fn, options)`. Options:

| option | default | meaning |
| --- | --- | --- |
| `attempts` | `3` | total tries, including the first |
| `baseDelay` | `10` | ms before the first retry |
| `factor` | `2` | exponential multiplier |
| `jitter` | `(ms) => ms` | maps each computed delay to the one actually waited |
| `shouldRetry` | `() => true` | `(error, attempt) => boolean` |
| `sleep` | built-in, abortable | `(ms, signal) => Promise`; injected so tests can observe delays |
| `signal` | — | an `AbortSignal` that stops retrying |

Behaviour:

- `fn` is called as `fn(attempt)` with `attempt` starting at 1
- delay before retry *n* is `jitter(baseDelay * factor ** (n - 1))`, passed to
  `sleep(ms, signal)`
- when attempts run out, reject with the **last** error
- if `shouldRetry` returns false, reject immediately without waiting
- if the signal is already aborted, do not call `fn` at all and reject with
  `signal.reason`
- if it aborts during a wait, reject with `signal.reason` — **promptly**. The
  built-in sleep must end the moment the signal aborts, not after the delay
  (a user who navigated away should not wait out a 30 s backoff). An injected
  `sleep` may ignore the signal, so check it again after every wait.
