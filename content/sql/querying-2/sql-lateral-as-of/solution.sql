select
  o.id as order_id,
  o.currency,
  o.amount_cents,
  rate.effective_at as rate_effective_at,
  case
    when o.currency = 'GBP' then o.amount_cents
    else round(o.amount_cents::numeric * rate.rate_micros / 1000000)::int
  end as gbp_cents
from orders o
-- Runs once per order: the newest rate at or before the order. LEFT ... ON
-- TRUE keeps orders the subquery finds nothing for (GBP, or too early).
left join lateral (
  select r.effective_at, r.rate_micros
  from fx_rates r
  where r.currency = o.currency
    and r.effective_at <= o.placed_at
  order by r.effective_at desc
  limit 1
) rate on true
order by o.id;
