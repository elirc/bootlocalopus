select
  o.id,
  jsonb_build_object(
    'id', o.id,
    'status', o.status,
    'placedOn', o.placed_on,
    'customer', jsonb_build_object('id', c.id, 'name', c.name),
    'items', li.items,
    'totalCents', li.total_cents
  ) as body
from orders o
join customers c on c.id = o.customer_id
-- One aggregate per order. Over zero lines, jsonb_agg and sum return NULL,
-- so both get a coalesce: the API promises [] and 0.
cross join lateral (
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'sku', p.sku,
          'name', p.name,
          'qty', oi.qty,
          'unitCents', oi.unit_cents,
          'lineCents', oi.qty * oi.unit_cents
        )
        -- Without this the array comes out in whatever order the plan reads rows.
        order by oi.id
      ),
      '[]'
    ) as items,
    coalesce(sum(oi.qty * oi.unit_cents), 0)::int as total_cents
  from order_items oi
  join products p on p.id = oi.product_id
  where oi.order_id = o.id
) li
where o.status = 'paid'
order by o.placed_on desc, o.id desc;
