The nightly "charge renewals" job ran fine for a year. Then the service was
scaled to three replicas for Black Friday, each with its own in-process
scheduler, and at 02:00 every customer was charged **three times**.

Every replica runs the same schedule, so a job that must run once needs a
**lock the replicas share** — the database they already have. The lock is a
row that says who holds the job and **until when**: if the holder crashes, the
lock expires on its own instead of blocking the job forever.

The classic bug is taking it in two steps:

```js
const { rows } = await conn.query('select … from job_locks where name = $1', [name]);
if (rows.length === 0 || rows[0].locked_until <= now) {
  await conn.query('insert … on conflict (name) do update set owner = $2 …');   // both replicas get here
}
```

Two replicas both read "free", both write, both run. Acquiring must be **one
atomic statement** that only succeeds if the lock is free — and tells you
whether it did.

The fixture: `job_locks(name text primary key, owner text not null,
locked_until timestamptz not null)`.

## Task

Time comes from the caller: `now` is a `Date`. Never use the database's
`now()` — the tests run at a fixed instant years away from the real clock.
Every value goes in the parameter array.

### 1. `tryAcquire(conn, { name, owner, ttlMs, now })` → `true` or `false`

**One statement.** Take the lock — set `owner` and `locked_until = now +
ttlMs` — when there is no row for `name`, when the existing lock has expired
(`locked_until <= now`), or when `owner` already holds it (that renews it).
Otherwise leave the row alone. Resolve to whether you now hold the lock.

`insert … on conflict (name) do update set … where …  returning …` does this:
the `where` on the `do update` decides whether the existing row may be taken,
and `returning` gives you a row only if the insert or update happened.

### 2. `release(conn, { name, owner })` → `true` or `false`

Delete the lock only if `owner` holds it; resolve to whether a row was
deleted. A replica whose lock expired and was taken over must not delete the
new holder's lock.

### 3. `runExclusive(conn, { name, owner, ttlMs, now }, fn)`

If `tryAcquire` fails, resolve to `{ ran: false }` without calling `fn`.
Otherwise `await fn()`, then `release`, and resolve to
`{ ran: true, result }`. If `fn` throws, still `release`, then rethrow the
original error.

## How it is graded

A spy wraps `conn`. In one test another replica grabs the lock **right after
your first query** returns: your `tryAcquire` must neither throw nor steal a
lock that is still valid, and its answer must match who holds the row.
