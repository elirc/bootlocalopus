create function customer_document(p_customer_id int)
returns jsonb
language sql stable as $$
  -- Aggregates cannot be nested in one SELECT, so each level of the document
  -- is its own subquery, correlated to the level above.
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'orderCount', (select count(*) from orders o where o.customer_id = c.id),
    'lifetimeCents', (
      select coalesce(sum(oi.qty * oi.unit_cents), 0)
      from orders o
      join order_items oi on oi.order_id = o.id
      where o.customer_id = c.id and o.status = 'paid'
    ),
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'status', o.status,
          'placedOn', o.placed_on,
          'items', li.items,
          'totalCents', li.total_cents
        )
        order by o.placed_on desc, o.id desc
      )
      from orders o
      cross join lateral (
        select
          coalesce(
            jsonb_agg(
              jsonb_build_object('sku', oi.sku, 'qty', oi.qty, 'lineCents', oi.qty * oi.unit_cents)
              order by oi.id
            ),
            '[]'
          ) as items,
          coalesce(sum(oi.qty * oi.unit_cents), 0) as total_cents
        from order_items oi
        where oi.order_id = o.id
      ) li
      where o.customer_id = c.id
    ), '[]')
  )
  from customers c
  -- No such customer: no row, so the function returns NULL (the handler's 404).
  where c.id = p_customer_id;
$$;
