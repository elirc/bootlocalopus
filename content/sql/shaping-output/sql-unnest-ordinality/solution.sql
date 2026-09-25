create function products_by_ids(p_ids int[])
returns table (pos int, id int, name text, price_cents int, found boolean)
language sql stable as $$
  select
    req.pos::int,
    req.id,
    p.name,
    p.price_cents,
    p.id is not null
  -- WITH ORDINALITY numbers the elements, so input order (and duplicates)
  -- survive; the LEFT JOIN keeps ids with no product.
  from unnest(p_ids) with ordinality as req(id, pos)
  left join products p on p.id = req.id
  order by req.pos;
$$;
