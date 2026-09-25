create function orders_page(p_customer_id int, p_limit int, p_before_id int)
returns jsonb
language sql stable as $$
  -- Every order at once, raw rows, drafts included, no paging.
  select jsonb_build_object(
    'customer', jsonb_build_object('id', c.id, 'name', c.name),
    'orders', (select jsonb_agg(to_jsonb(o)) from orders o where o.customer_id = c.id),
    'page', jsonb_build_object('limit', p_limit, 'nextBefore', null, 'totalOrders', 0)
  )
  from customers c
  where c.id = p_customer_id;
$$;
