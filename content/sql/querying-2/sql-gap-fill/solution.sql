with days as (
  select d::date as day
  from generate_series('2024-03-01'::date, '2024-03-07'::date, interval '1 day') as d
)
select
  p.sku,
  to_char(days.day, 'YYYY-MM-DD') as day,
  latest.quantity,
  -- Filled unless a count happened on exactly this day (null-safe).
  latest.counted_on is distinct from days.day as is_filled
-- The grid: every product on every day, whether or not there is data.
from products p
cross join days
-- The latest count on or before the day, however long before the range.
left join lateral (
  select sc.quantity, sc.counted_on
  from stock_counts sc
  where sc.product_id = p.id
    and sc.counted_on <= days.day
  order by sc.counted_on desc
  limit 1
) latest on true
order by p.sku, days.day;
