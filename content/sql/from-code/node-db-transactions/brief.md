The starter's `transfer` has three bugs that only show up in production:

- **No transaction.** If anything fails between the debit and the credit — a
  typo'd account id, a dropped connection, a deploy — the money has left one
  account and arrived nowhere.
- **Check, then act.** It reads the balance, decides in JavaScript, then
  writes. Two requests can both read 12,000 and both spend 10,000.
- **No idempotency.** The client timed out and retried, and the customer paid
  twice. The first request had worked; nobody told the client.

The fixture: `accounts(id text, owner, balance_cents int check (>= 0))` with
`acc_ada` 50000, `acc_bob` 12000, `acc_cy` 0; `transfers(id serial, from_id,
to_id, cents)`; and `idempotency_keys(key text primary key, request jsonb,
response jsonb)`. Money is integer cents throughout.

## Task

Rewrite `transfer(conn, { from, to, cents, idempotencyKey })`. It resolves to
exactly `{ transferId, fromBalanceCents, toBalanceCents }`: the new
`transfers.id` and both balances right after the move.

1. **Validate first.** `from` and `to` are non-empty strings and differ;
   `cents` is a positive safe integer (`Number.isSafeInteger`, so not `'100'`,
   `10.5` or `NaN`); `idempotencyKey` is a non-empty string. Otherwise throw a
   `RangeError` — before any query.
2. **One transaction.** `conn.query('begin')` … `conn.query('commit')`, and on
   **any** throw inside, `conn.query('rollback')` then rethrow the **original**
   error unchanged. No path may leave the connection inside a transaction.
3. **Replay.** Inside the transaction, look the key up in
   `idempotency_keys`. If found with the same `{ from, to, cents }`, resolve to
   the stored `response` — the original result, even though balances have
   moved since — and move nothing. Found with different values: throw
   `IdempotencyKeyReusedError` (with `.key`).
4. **Debit conditionally, in one statement:** `update accounts set
   balance_cents = balance_cents - $1 where id = $2 and balance_cents >= $1
   returning balance_cents`. No row back means the money is not there — or the
   account is not: tell them apart and throw `InsufficientFundsError` or
   `AccountNotFoundError` (both with `.accountId`).
5. **Credit with a second `UPDATE`.** No row back → `AccountNotFoundError`
   for `to`, and the rollback undoes the debit.
6. **Record it**: insert the `transfers` row, then the key with
   `request = { from, to, cents }` and `response` = the result, as JSON
   (`JSON.stringify` into `$n::jsonb`). Same transaction, so a failed
   transfer never stores its key and can be retried with it.

Every value goes in the parameter array; only `conn.query(text, params)`
exists on the connection the grader passes.

## How it is graded

A spy wraps `conn`. It checks for one `BEGIN` and one `COMMIT` around every
write; no account id, amount or key in any SQL text; and a `ROLLBACK` after
each failure. Failures are injected: the **second `UPDATE` throws** (after
your debit), and a concurrent withdrawal empties Bob's account **just before
your first `UPDATE` runs** — only a conditional debit notices that one. After
every failure, balances, `transfers` and `idempotency_keys` must be exactly as
before, and the connection must not be inside a transaction. A mixed run of
successes, failures and replays must leave the total at 62,000 cents after
every step.

Out of scope, but true in production: two concurrent first attempts with the
same key race to insert it; the loser hits the primary key, rolls back, and
its retry finds the stored response. And transfers in opposite directions can
deadlock unless rows are always locked in the same order (e.g. by id).
