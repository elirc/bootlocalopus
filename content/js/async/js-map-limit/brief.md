`Promise.all` has no brakes. Map 5,000 ids over an API call and you open
5,000 sockets at once. What you actually want is a worker pool.

## Task

Export `mapLimit(items, limit, fn)`:

- resolves to results **in input order**
- never has more than `limit` calls to `fn` in flight
- starts a new task the moment a slot frees up (do **not** process in fixed
  batches — one slow item must not idle the pool)
- `fn` is called as `fn(item, index)`
- if `fn` rejects, the returned promise rejects with the first error

Aim for the version with `limit` long-lived workers pulling from a shared
cursor.