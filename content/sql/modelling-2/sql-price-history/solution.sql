-- 1. A version must cover at least an instant.
alter table product_prices
  add constraint product_prices_period_valid
  check (valid_to is null or valid_to > valid_from);

-- 2. One current price per product.
create unique index product_prices_one_current_idx
  on product_prices (product_id)
  where valid_to is null;

-- 3. Close the current version, then open the next. In this order: the other
--    way round, the partial unique index sees two current prices. A change at
--    or before the current valid_from makes the UPDATE violate the check,
--    and the whole call fails with nothing changed.
create function set_price(p_product_id int, p_price_cents int, p_at timestamptz)
returns void
language sql as $$
  update product_prices
  set valid_to = p_at
  where product_id = p_product_id and valid_to is null;

  insert into product_prices (product_id, price_cents, valid_from)
  values (p_product_id, p_price_cents, p_at);
$$;

-- 4. Half-open periods: >= valid_from and < valid_to. A left join keeps
--    orders placed before the product had any price.
create view order_prices as
select
  o.id as order_id,
  o.product_id,
  o.placed_at,
  pp.price_cents
from orders o
left join product_prices pp
  on pp.product_id = o.product_id
 and o.placed_at >= pp.valid_from
 and (pp.valid_to is null or o.placed_at < pp.valid_to);
