select
  c.name as customer_name,
  o.placed_at,
  o.total_cents,
  -- o.id breaks ties between same-day orders, so the order is total.
  row_number() over (partition by o.customer_id order by o.placed_at, o.id)::int as order_seq,
  -- With ORDER BY, the default frame is RANGE ... CURRENT ROW, which includes
  -- every *peer* (same placed_at). ROWS stops at this exact row.
  sum(o.total_cents) over (
    partition by o.customer_id
    order by o.placed_at, o.id
    rows between unbounded preceding and current row
  )::int as running_cents,
  -- No ORDER BY: the frame is the whole partition.
  sum(o.total_cents) over (partition by o.customer_id)::int as customer_total_cents,
  rank() over (order by o.total_cents desc)::int as overall_rank
from orders o
join customers c on c.id = o.customer_id
where o.status = 'paid'
order by c.name, o.placed_at, o.id;
