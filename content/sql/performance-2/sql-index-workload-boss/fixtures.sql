create table tickets (
  id serial primary key,
  tenant_id integer not null,
  status text not null check (status in ('open', 'pending', 'solved', 'closed')),
  priority integer not null check (priority between 1 and 4),   -- 4 is urgent
  assignee_id integer,                                            -- null: unassigned
  subject text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

insert into tickets (tenant_id, status, priority, assignee_id, subject, created_at, updated_at)
select
  g % 20 + 1,
  (array['open', 'pending', 'solved', 'closed'])[1 + (g * 7) % 4],
  1 + g % 4,
  case when g % 9 = 0 then null else g % 60 + 1 end,
  (array['Refund request', 'Login problem', 'refund not received', 'Invoice question', 'Bug report'])[1 + g % 5] || ' #' || g,
  '2024-01-01T00:00:00Z'::timestamptz + g * interval '5 minutes',
  '2024-01-01T00:00:00Z'::timestamptz + g * interval '5 minutes' + (g % 100) * interval '1 hour'
from generate_series(1, 20000) as g;

-- Indexes added over the years, one incident at a time.
create index tickets_tenant_idx on tickets (tenant_id);
create index tickets_status_idx on tickets (status);
create index tickets_tenant_status_idx on tickets (tenant_id, status);
create index tickets_subject_idx on tickets (subject);

analyze tickets;
