create table tickets (
  id serial primary key,
  title text not null,
  status text not null check (status in ('open', 'pending', 'closed')),
  assignee_id integer,                 -- null: unassigned
  priority integer not null check (priority between 1 and 4),
  tags text[] not null default '{}',
  created_at timestamptz not null
);

insert into tickets (title, status, assignee_id, priority, tags, created_at)
select
  (array['Refund not received', 'Cannot log in', 'Invoice is wrong', 'App crashes on start', '100% CPU on export'])[1 + g % 5]
    || ' #' || g,
  (array['open', 'pending', 'closed'])[1 + g % 3],
  case when g % 4 = 0 then null else 1 + g % 3 end,
  1 + (g * 7) % 4,
  case g % 6
    when 0 then '{billing}'::text[]
    when 1 then '{billing,urgent}'::text[]
    when 2 then '{auth}'::text[]
    when 3 then '{auth,urgent}'::text[]
    when 4 then '{}'::text[]
    else '{mobile}'::text[] end,
  '2024-04-01T00:00:00Z'::timestamptz + g * interval '9 hours'
from generate_series(1, 60) as g;
