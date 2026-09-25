-- TODO: 1. the check constraint   2. the partial unique index

create function set_price(p_product_id int, p_price_cents int, p_at timestamptz)
returns void
language sql as $$
  -- TODO: close the current price, open the new one
  select null::void;
$$;

create view order_prices as
select o.id as order_id, o.product_id, o.placed_at, pp.price_cents
from orders o
join product_prices pp
  on pp.product_id = o.product_id
 and o.placed_at between pp.valid_from and coalesce(pp.valid_to, 'infinity');
