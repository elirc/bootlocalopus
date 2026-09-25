create function products_by_ids(p_ids int[])
returns table (pos int, id int, name text, price_cents int, found boolean)
language sql stable as $$
  select
    (row_number() over ())::int,
    p.id,
    p.name,
    p.price_cents,
    true
  from products p
  where p.id = any(p_ids);
$$;
