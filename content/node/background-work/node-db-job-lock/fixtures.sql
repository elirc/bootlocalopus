-- One row per scheduled job that some replica currently holds.
create table job_locks (
  name text primary key,
  owner text not null,
  locked_until timestamptz not null
);
