`await` inside a `for` loop is sequential. Ten 100 ms calls become one
second. `Promise.all` makes them 100 ms — but only if you start them all
before awaiting.

## Task

Export two functions, both resolving to results **in input order**:

- `loadSequential(ids, loadOne)` — one at a time (sometimes you need this: rate
  limits, ordering guarantees)
- `loadParallel(ids, loadOne)` — all at once

Then export `settleAll(ids, loadOne)` which never rejects: it resolves to an
array of `{ status: 'fulfilled', value }` or `{ status: 'rejected', reason }`
in input order.

Build `settleAll` yourself with `.then`/`.catch` — do not call
`Promise.allSettled`.

`loadOne` is someone else's code, and it may **throw synchronously** instead of
returning a rejected promise (a bad argument check, a typo). `settleAll` must
report that as `rejected` too, not let the exception escape.