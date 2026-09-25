create function orders_page(p_customer_id int, p_limit int, p_before_id int)
returns jsonb
language sql stable as $$
  with lim as (
    -- Clamp what the client asked for: missing means 20, and 1..50 is the range.
    select least(greatest(coalesce(p_limit, 20), 1), 50) as n
  ),
  candidates as (
    -- Keyset pagination on id, newest first. One row more than the page
    -- tells us whether another page exists without a second count.
    select o.id, o.status, o.placed_on
    from orders o
    where o.customer_id = p_customer_id
      and o.status <> 'draft'
      and (p_before_id is null or o.id < p_before_id)
    order by o.id desc
    limit (select n + 1 from lim)
  ),
  shown as (
    select cd.*
    from candidates cd
    order by cd.id desc
    limit (select n from lim)
  )
  select jsonb_build_object(
    'customer', jsonb_build_object('id', c.id, 'name', c.name),
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'status', s.status,
          'placedOn', s.placed_on,
          'items', li.items,
          'tags', tg.tags,
          'totalCents', li.total_cents
        )
        order by s.id desc
      )
      from shown s
      -- Items and tags are aggregated separately: joined together they
      -- would multiply each other.
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
        where oi.order_id = s.id
      ) li
      cross join lateral (
        select coalesce(jsonb_agg(ot.tag order by ot.tag), '[]') as tags
        from order_tags ot
        where ot.order_id = s.id
      ) tg
    ), '[]'),
    'page', jsonb_build_object(
      'limit', (select n from lim),
      -- Only when the extra row exists; a page that is exactly full is not
      -- evidence of a next page.
      'nextBefore', case
        when (select count(*) from candidates) > (select n from lim)
        then (select min(s.id) from shown s)
      end,
      'totalOrders', (
        select count(*) from orders o
        where o.customer_id = c.id and o.status <> 'draft'
      )
    )
  )
  from customers c
  where c.id = p_customer_id;
$$;
