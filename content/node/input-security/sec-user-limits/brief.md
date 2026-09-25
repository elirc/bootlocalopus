A global rate limit protects the server from the crowd. It does nothing about
**one** account: a single user (or a single stolen API key) that starts forty
uploads at once holds forty workers, and one that uploads 500 GB a day is
your storage bill. Input limits need a per-user dimension: how much at once,
and how much in total.

Both have a classic accounting bug:

- **Checking only what is finished.** Quota is 100 MB, 90 MB is used, and ten
  10 MB uploads start at the same moment. Each one checks "90 + 10 ≤ 100" and
  goes ahead. Bytes still in flight must be **reserved** when an upload starts
  and counted by everyone who checks after it.
- **Releasing twice.** The `finally` releases the slot, and so does the error
  handler. Now the user has three slots instead of two, and it only gets
  worse. A release must work **once**.

And the failure path matters: a failed upload gives its reservation back, a
successful one turns it into usage.

## Task

Export `class LimitError extends Error` whose constructor takes a `code`
(`name = 'LimitError'`, `this.code`, message = code).

Export `createUserLimits({ maxInFlight = 2, bytesPerDay = 104_857_600, now = Date.now } = {})`
returning:

**`acquire(userId, bytes)`** → a `release` function, or throws a `LimitError`:

1. `'invalid-size'` — `bytes` is not a non-negative safe integer.
2. `'too-many-in-flight'` — the user already holds `maxInFlight` acquisitions.
3. `'quota-exceeded'` — `usedToday + reserved + bytes > bytesPerDay`, where
   `reserved` is the bytes of the user's in-flight acquisitions.

On success the user holds one more slot and `bytes` more reserved.

**`release(ok = true)`** → the first call gives back the slot and the
reservation, and if `ok` is true adds `bytes` to the usage of the day the
acquisition was made; it returns `true`. Every later call does nothing and
returns `false`.

**`usage(userId)`** → `{ inFlight, reserved, usedToday, remaining }` where
`remaining = max(0, bytesPerDay - usedToday - reserved)`.

A "day" is the **UTC** calendar date of `now()`
(`new Date(t).toISOString().slice(0, 10)`): usage starts again from 0 at UTC
midnight. An upload that started before midnight and finishes after it counts
against the day it **started**, not the new one. Users are independent, and
an unknown user has zero of everything. Keep only the current day's usage per
user — this runs forever.
