create table events (
  id serial primary key,
  account_id integer not null,
  kind text not null,
  created_at timestamptz not null
);

-- Account 1 is the big customer: half of all events. Accounts 2..101 have
-- 100 events each.
insert into events (account_id, kind, created_at)
select
  case when g <= 10000 then 1 else 2 + (g % 100) end,
  (array['click', 'view', 'purchase', 'signup'])[1 + g % 4],
  '2024-01-01T00:00:00Z'::timestamptz + g * interval '1 minute'
from generate_series(1, 20000) as g;

create index events_account_idx on events (account_id);

analyze events;

-- A staging table nobody has analyzed yet.
create table imports (line text not null);
insert into imports (line) select 'row ' || g from generate_series(1, 500) as g;
