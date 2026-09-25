Every ORM ships a migrations runner, and one day you will debug it: the
deploy that ran a migration twice, the half-applied migration that nobody
can roll forward or back, the teammate who "just fixed a typo" in a
migration that production ran last month. The runner itself is about sixty
lines. Writing one is the fastest way to know what yours does.

The rules every serious runner follows:

- **Bookkeeping in the database.** A `schema_migrations` table records the
  id of every applied migration, so each runs exactly once.
- **Deterministic order.** Migrations apply in **id order** (ids like
  `001_users`, `002_posts` sort correctly as strings), whatever order the
  files were listed in.
- **One transaction per migration, bookkeeping included.** Postgres DDL is
  transactional, so a migration that fails halfway leaves nothing behind —
  and because its `schema_migrations` row is inserted in the same
  transaction, it is never recorded as applied when it was not, or applied
  without being recorded.
- **Stop at the first failure.** Later migrations may depend on it.
- **Applied migrations are immutable.** Store a checksum of each one's SQL;
  if an applied migration's file changes, refuse to run **anything**. The
  database no longer matches the code, and a human must decide.

## Task

`migrate(conn, migrations)`, where `migrations` is an array of `{ id, sql }`
and `sql` may hold several statements. It resolves to the ids it applied
in this run, in order.

1. Validate first: each migration has a non-empty string `id` and a string
   `sql`, and no id repeats. Otherwise throw a `RangeError` before any
   query.
2. Create `schema_migrations(id text primary key, checksum text not null,
   applied_at timestamptz not null default now())` if it does not exist.
3. If any **applied** migration's `checksum(sql)` (exported by the starter:
   the hex SHA-256) differs from the stored one, throw
   `MigrationChecksumError` (with `.migrationId`) before applying anything.
4. For each unapplied migration in id order: `begin`; run its SQL with
   `conn.exec(sql)`; insert its id and checksum with `conn.query(text,
   params)`; `commit`. On any error: `rollback`, then throw
   `new MigrationFailedError(id, err)` — the original error becomes
   `.cause` — and apply nothing further.

The connection has `query(text, params)` (one statement, with parameters)
and `exec(sql)` (any number of statements, no parameters).

## How it is graded

On an empty database, through a spy on both methods: first runs, reruns
that apply nothing and run no migration SQL, input in the wrong order, an
edited applied migration, a migration that fails in its second statement
(its first must be undone, earlier migrations kept, later ones not run,
`.cause.code` the database's), and an injected failure of the bookkeeping
insert, after which the migration's tables must not exist.

Out of scope, but true in production: two app servers starting at once
both run the migrations unless the runner holds an advisory lock for the
whole run; and some statements (`CREATE INDEX CONCURRENTLY`) cannot run in
a transaction at all, so real runners let a migration opt out.
