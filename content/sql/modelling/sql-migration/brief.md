On a table serving traffic, the question for every migration step is not "is
the SQL right?" but "what lock does it take, and for how long?". An
`ACCESS EXCLUSIVE` lock blocks every read and write; held for a full-table scan
on a big table, it is an outage.

What modern Postgres (11+) actually does:

- `add column ... default 'free'` with a **constant** default is
  metadata-only: no rewrite, no scan, done in milliseconds — even with
  `not null`. The old advice ("add nullable → backfill → constrain") dates from
  before PG11, and is still the right pattern when the value must be
  **computed per row**, because a big `update` is the slow part and can be
  batched.
- `alter column ... set not null` on an existing column scans the whole table
  under `ACCESS EXCLUSIVE` (unless a validated `check (col is not null)`
  already proves it, PG12+).
- `add constraint ... check (...)` scans under `ACCESS EXCLUSIVE` too. Split it:
  `add constraint ... not valid` (instant; enforced for new writes), then
  `validate constraint` (scans, but only takes a lock that lets reads and
  writes continue).
- `create unique index` blocks writes for the whole build. In production you
  write `create unique index concurrently`. It **cannot run inside a
  transaction**, and the grader runs your migration as one, so write the plain
  form here and know that the real one needs `concurrently` in its own
  non-transactional migration step.

The fixture has `accounts(id, email, created_at)` with rows already in it.

## Task

Write a migration that:

1. Adds `plan text not null default 'free'` — existing rows read as `'free'`
2. Adds a check that `plan in ('free', 'pro', 'enterprise')`, named
   `accounts_plan_valid`, **without** a long exclusive lock: add it
   `not valid`, then validate it. The grader checks that it ends up validated.
3. Adds `last_seen_at timestamptz` (nullable — genuinely unknown for old rows,
   and inventing a value would be a lie)
4. Adds a unique index named `accounts_email_lower_idx` on `lower(email)`, so
   `Ada@x.com` and `ada@x.com` cannot both exist

Do not drop or recreate the table: the existing rows and ids must survive.

The grader can check the resulting schema and data, not the locks you took on
the way — that part is on you, and it is the part that matters in production.
