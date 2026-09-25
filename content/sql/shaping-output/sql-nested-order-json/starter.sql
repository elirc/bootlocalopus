-- Dumps raw rows into the response: wrong key names, [null] for an order
-- with no lines, and no customer.
select
  o.id,
  jsonb_build_object(
    'id', o.id,
    'status', o.status,
    'placedOn', o.placed_on,
    'items', jsonb_agg(oi)
  ) as body
from orders o
left join order_items oi on oi.order_id = o.id
where o.status = 'paid'
group by o.id
order by o.id;
