with paid as (
  select
    o.*,
    row_number() over (partition by o.customer_id order by o.placed_at desc) as recency
  from orders o
  where o.status = 'paid'
)
select
  c.name,
  count(p.id)::int as order_count,
  -- Only the three newest go into the array; the count above still sees them all.
  coalesce(
    json_agg(
      json_build_object(
        'id', p.id,
        'total_cents', p.total_cents,
        'placed_at', to_char(p.placed_at, 'YYYY-MM-DD')
      )
      order by p.placed_at desc
    ) filter (where p.recency <= 3),
    '[]'::json
  ) as recent_orders
from customers c
join paid p on p.customer_id = c.id
group by c.id, c.name
order by c.name;
