"Who changed this customer's plan, and what was it before?" If the answer
depends on every code path remembering to write a log line, the answer is
"we don't know" — the admin script, the backfill and the one endpoint that
forgot will all skip it. A trigger on the table cannot be skipped.

Three things separate a useful audit trail from a noisy or fragile one:

- **History outlives the row.** The audit table must *not* have a foreign key
  to `accounts`: with `on delete cascade` deleting an account erases its
  history, and without it the delete is refused.
- **No-op updates are not changes.** ORMs routinely write every column back
  unchanged. Log only when the row actually differs.
- **Who did it** comes from the application. The pattern is a transaction-local
  setting the app sets after `BEGIN` — `select set_config('app.actor',
  'alice', true)` — and the trigger reads with
  `current_setting('app.actor', true)` (the `true` means "null if unset"
  rather than an error).

The fixture has `accounts(id serial primary key, email text not null,
plan text not null, balance_cents int not null default 0)`, with rows.

## Task

1. Create `account_audit`:
   - `id` — `bigserial` primary key
   - `account_id` — int, required, **no foreign key**
   - `op` — text, required: `'INSERT'`, `'UPDATE'` or `'DELETE'`
   - `actor` — text, nullable: `current_setting('app.actor', true)` at the time
   - `changed_at` — `timestamptz`, required, default `now()`
   - `old_row` — `jsonb`: the row before (`NULL` for an insert)
   - `new_row` — `jsonb`: the row after (`NULL` for a delete)
2. Write a PL/pgSQL trigger function and attach it as an `AFTER INSERT OR
   UPDATE OR DELETE ... FOR EACH ROW` trigger on `accounts`, writing one
   audit row per changed account row. `to_jsonb(OLD)` / `to_jsonb(NEW)` turn a
   row into a document; `TG_OP` holds the operation name.
3. An `UPDATE` that changes nothing (every column equal before and after)
   writes **no** audit row.

## How it is graded

The grader inserts, updates and deletes accounts (some with `app.actor` set,
some without) and reads `account_audit`. Multi-row statements must write one
audit row per account row.
