-- A job queue in Postgres: enqueue in the same transaction as the business
-- write, and a job can never be "sent" for an order that rolled back.
create table jobs (
  id serial primary key,
  queue text not null,
  payload jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'dead')),
  run_at timestamptz not null default now(),   -- not before this time
  attempts integer not null default 0,          -- claims so far
  locked_until timestamptz,                     -- the running worker's lease
  last_error text
);

-- Workers only ever look for claimable rows, so index only those.
create index jobs_claimable_idx on jobs (queue, run_at, id)
  where status in ('queued', 'running');

insert into jobs (queue, payload, status, run_at, attempts, locked_until) values
  ('emails',  '{"to": "ada"}',   'queued',  '2024-05-01T11:50:00Z', 0, null),
  ('emails',  '{"to": "bob"}',   'queued',  '2024-05-01T11:55:00Z', 0, null),
  ('emails',  '{"to": "cy"}',    'queued',  '2024-05-01T12:10:00Z', 0, null),
  ('reports', '{"month": "04"}', 'queued',  '2024-05-01T11:40:00Z', 0, null),
  ('emails',  '{"to": "dee"}',   'done',    '2024-05-01T11:30:00Z', 1, null),
  ('emails',  '{"to": "eve"}',   'running', '2024-05-01T11:45:00Z', 1, '2024-05-01T11:59:00Z'),
  ('emails',  '{"to": "fay"}',   'running', '2024-05-01T11:44:00Z', 1, '2024-05-01T12:05:00Z'),
  ('emails',  '{"to": "gus"}',   'dead',    '2024-05-01T11:20:00Z', 5, null);
