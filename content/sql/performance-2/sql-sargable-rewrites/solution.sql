-- The rule: leave the indexed column bare on one side of the comparison and
-- move every function and every bit of arithmetic to the constant side.

-- A day is a half-open range: from midnight, up to but not including the
-- next midnight. BETWEEN would include 2024-01-16 00:00:00 exactly.
create or replace view orders_on_day as
select id, customer_id, total_cents, created_at
from orders
where created_at >= '2024-01-15T00:00:00Z'
  and created_at <  '2024-01-16T00:00:00Z';

-- "More than 50.00" in cents is "more than 5000". (Integer division,
-- total_cents / 100 > 50, would silently drop 5001 to 5099.)
create or replace view big_orders as
select id, customer_id, total_cents, created_at
from orders
where total_cents > 5000;

-- coalesce() hides the column; spelling out both cases lets Postgres combine
-- two index lookups (a B-tree indexes NULLs and can search for IS NULL).
create or replace view unprocessed_orders as
select id, customer_id, total_cents, created_at
from orders
where status = 'new' or status is null;

create or replace view orders_2023 as
select id, customer_id, total_cents, created_at
from orders
where created_at >= '2023-01-01T00:00:00Z'
  and created_at <  '2024-01-01T00:00:00Z';
