-- NULL means live. A timestamp rather than a boolean: "when" is the first
-- question support asks.
alter table users add column deleted_at timestamptz;

-- The old rule covered deleted rows too, so a deleted user blocked re-signup.
alter table users drop constraint users_email_key;

-- Unique among live rows only, and case-insensitive. On a busy table this is
-- CREATE UNIQUE INDEX CONCURRENTLY, in its own non-transactional migration.
create unique index users_live_email_idx
  on users (lower(email))
  where deleted_at is null;

-- The safe default for application reads: the filter is already applied.
create view live_users as
select id, email, name
from users
where deleted_at is null;
