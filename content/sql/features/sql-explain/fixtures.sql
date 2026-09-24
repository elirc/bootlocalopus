create table orders (
  id serial primary key,
  customer_id int not null,
  status text not null,
  total_cents int not null,
  placed_at timestamptz not null
);

-- 60,000 orders, deterministic. Customer 42 is the big account: every tenth
-- order is theirs (6,000 rows); everyone else has about 27.
insert into orders (customer_id, status, total_cents, placed_at)
select
  case when g % 10 = 0 then 42 else 1 + (g::bigint * 7919) % 2000 end,
  (array['paid', 'paid', 'paid', 'pending', 'refunded'])[1 + g % 5],
  500 + (g * 31) % 20000,
  timestamptz '2024-01-01 00:00:00+00' + ((g::bigint * 104729) % 525600) * interval '1 minute'
from generate_series(1, 60000) as g;

-- The index someone added "for the customer page" last year.
create index orders_customer_id_idx on orders (customer_id);

analyze orders;
