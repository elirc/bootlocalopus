create function customer_document(p_customer_id int)
returns jsonb
language sql stable as $$
  -- The customer is there; the orders and their items are not.
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'orderCount', 0,
    'lifetimeCents', 0,
    'orders', '[]'::jsonb
  )
  from customers c
  where c.id = p_customer_id;
$$;
