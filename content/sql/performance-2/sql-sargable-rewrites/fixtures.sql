create table orders (
  id serial primary key,
  customer_id integer not null,
  status text,                          -- null: imported before statuses existed
  total_cents integer not null,
  created_at timestamptz not null
);

insert into orders (customer_id, status, total_cents, created_at)
select
  g % 97 + 1,
  case when g % 10 = 0 then null
       when g % 3 = 0 then 'new'
       when g % 3 = 1 then 'paid'
       else 'shipped' end,
  (g * 37) % 12000,
  '2023-06-01T00:00:00Z'::timestamptz + g * interval '97 minutes'
from generate_series(1, 4000) as g;

-- Rows on the edges every rewrite has to get right.
insert into orders (customer_id, status, total_cents, created_at) values
  (1, 'new',  5000, '2024-01-15T00:00:00Z'),
  (2, null,   5001, '2024-01-15T23:59:59.999999Z'),
  (3, 'paid', 5099, '2024-01-16T00:00:00Z'),
  (4, 'new',  5100, '2023-12-31T23:59:59.999999Z'),
  (5, null,   4999, '2024-01-01T00:00:00Z'),
  (6, 'paid', 5050, '2023-01-01T00:00:00Z');

create index orders_created_at_idx on orders (created_at);
create index orders_total_cents_idx on orders (total_cents);
create index orders_status_idx on orders (status);

analyze orders;
