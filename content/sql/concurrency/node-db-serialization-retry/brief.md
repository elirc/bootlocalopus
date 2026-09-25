Alice and Bob are both on call on 1 March. The rule: at least one doctor
stays on call. Alice clicks "go off call": her request counts 2 on call,
decides that is fine, deletes her row. At the same moment Bob does the same,
counts 2 (Alice's delete has not committed), and deletes his. Nobody is on
call. No row was written twice, so no row lock would have helped: each
transaction changed a different row based on a read of the other's. That is
**write skew**.

`SERIALIZABLE` isolation catches it. Postgres tracks what each transaction
read and aborts one of them with SQLSTATE **`40001`**
(`could not serialize access …`). The price: **your code must retry the
whole transaction**, from `BEGIN`, re-running every read — the aborted
attempt's decisions were made on data that is no longer true. The same goes
for **`40P01`** (deadlock detected). Plenty of teams switch to SERIALIZABLE,
forget the retry, and turn a rare data bug into a steady trickle of 500s.

The fixture: `doctors(id, name)` — Alice 1, Bob 2, Carol 3 — and
`on_call(shift date, doctor_id)`: Alice and Bob on `2024-03-01`, Carol alone
on `2024-03-02`.

## Task

1. `withSerializableRetry(conn, work, { maxAttempts = 5, baseDelayMs = 10,
   sleep })` runs `await work(conn)` in a transaction and resolves to its
   result.
   - Start each attempt with `begin isolation level serializable` (or
     `start transaction isolation level serializable`), and `commit` at the
     end.
   - If anything throws — `work`, or the `commit` itself (serialization
     failures are often reported at commit) — send `rollback`. Then, if the
     error's `code` is `'40001'` or `'40P01'` and attempts remain, wait
     `baseDelayMs * 2 ** (attempt - 1)` ms (10, 20, 40, … by default) by
     awaiting `sleep(ms)`, and start a new attempt. Otherwise rethrow the
     error unchanged.
   - `maxAttempts` counts calls to `work`: after the last one fails, rethrow
     its error.
   - `sleep` defaults to a `setTimeout` promise. The grader passes its own.
2. `goOffCall(conn, shift, doctorId)` resolves to the number of doctors still
   on call for `shift` after the change, using `withSerializableRetry`
   (default options). If the doctor is not on call that shift, change
   nothing and resolve to the current count. If they are the only one,
   throw `LastDoctorError` (in the starter). Otherwise delete their row.

## How it is graded

Through a connection that only has `query(text, params)`. The grader asks
`show transaction_isolation` from inside `work` and expects `serializable`.
It injects errors carrying `code: '40001'` and `'40P01'` — from a statement
inside `work`, and from `COMMIT` — and checks that `work` ran again, that the
failed attempt's writes were rolled back, the delays you passed to `sleep`,
and that other errors (a constraint violation, a plain `Error`) are rethrown
after one attempt with no sleep. The connection must never be left inside a
transaction.

Production note: real code adds random jitter to the delay, so that two
transactions which collided do not retry in lock-step and collide again.
