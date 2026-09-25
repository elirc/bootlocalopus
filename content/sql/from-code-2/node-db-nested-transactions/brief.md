`createUser` runs in a transaction, because a user without their audit row
is a bug. `inviteTeam` runs in a transaction too, and calls `createUser` for
each email. Nobody noticed that the inner `BEGIN` is ignored (Postgres only
warns), and that the inner `COMMIT` **commits the outer transaction
halfway**: when the team invite fails on the fifth email, the first four
users stay.

Then someone tries to skip emails that already have an account by catching
the unique violation — and every statement after it fails with `current
transaction is aborted, commands ignored until end of transaction block`.
In Postgres, an error anywhere inside a transaction poisons the whole
transaction. You cannot catch it and carry on…

…unless you set a **savepoint** first. `SAVEPOINT name` marks a point
inside the transaction; `ROLLBACK TO SAVEPOINT name` undoes everything
after it and clears the error, so the transaction can continue; `RELEASE
SAVEPOINT name` forgets the mark and keeps the work — which still commits
or rolls back with the outer transaction. That is what "nested
transactions" in ORMs (Rails' `requires_new`, Django's nested `atomic`,
Knex's nested `transaction`) are made of.

The fixture: `users(id, email unique)` holding `taken@example.com`;
`teams`, `memberships(team_id, user_id)` and `audit(id, event, subject)`.

## Task

1. Fix `withTransaction(conn, work)`:
   - **Outermost** call on a connection: `begin`; `await work(conn)`;
     `commit`; resolve to work's result. On any error: `rollback` and
     rethrow the **same** error.
   - **Nested** call (made while `work` of a `withTransaction` on the
     **same connection** is still running): `savepoint <name>`; `await
     work(conn)`; `release savepoint <name>`. On error: `rollback to
     savepoint <name>` (and release it), then rethrow the same error — the
     outer transaction must remain usable if its code catches the error.
   - Track the depth **per connection** (a `WeakMap` keyed by `conn` is the
     natural tool), give each level a distinct savepoint name, and restore
     the depth when a call ends, however it ends.
2. `createUser` and `inviteTeam` in the starter then work as written: keep
   them as they are, or tidy them, but keep their behaviour —
   `inviteTeam(conn, { teamName, emails })` resolves to `{ teamId,
   created, skipped }`, skipping (in input order) every email that fails
   with a unique violation, including a repeat of an email created earlier
   in the same invite.

## How it is graded

Through a connection with only `query`. The grader nests calls up to three
levels deep and checks what survives: a caught inner failure undoes only
the inner writes and the outer transaction goes on; an uncaught one, or an
outer failure after a successful inner call, undoes everything; a new call
after a failure is outermost again; a call on a *different* connection
made inside another connection's transaction is outermost. After every
test, the connection must be out of the transaction.
