-- 1. A constant default is metadata-only since PG11: no rewrite, no scan,
--    so NOT NULL can go on in the same statement.
alter table accounts add column plan text not null default 'free';

-- 2. NOT VALID: instant, and enforced for every new write from now on.
--    VALIDATE then checks existing rows without blocking reads or writes.
alter table accounts add constraint accounts_plan_valid
  check (plan in ('free', 'pro', 'enterprise')) not valid;
alter table accounts validate constraint accounts_plan_valid;

-- 3. Honestly unknown for old rows, so it stays nullable.
alter table accounts add column last_seen_at timestamptz;

-- 4. Case-insensitive uniqueness needs an expression index. In production:
--    CREATE UNIQUE INDEX CONCURRENTLY, in its own non-transactional step.
create unique index accounts_email_lower_idx on accounts (lower(email));
