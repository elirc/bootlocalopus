-- Four reports, each correct and each reading every row of orders.
-- Rewrite the WHERE clauses so the existing indexes can be used.

create view orders_on_day as
select id, customer_id, total_cents, created_at
from orders
where created_at::date = '2024-01-15';

create view big_orders as
select id, customer_id, total_cents, created_at
from orders
where total_cents / 100.0 > 50;

create view unprocessed_orders as
select id, customer_id, total_cents, created_at
from orders
where coalesce(status, 'new') = 'new';

create view orders_2023 as
select id, customer_id, total_cents, created_at
from orders
where extract(year from created_at) = 2023;
