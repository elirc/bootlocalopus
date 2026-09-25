-- Only matches a rate published at exactly the order's time.
select
  o.id as order_id,
  o.currency,
  o.amount_cents,
  r.effective_at as rate_effective_at,
  round(o.amount_cents::numeric * r.rate_micros / 1000000)::int as gbp_cents
from orders o
join fx_rates r on r.currency = o.currency and r.effective_at = o.placed_at
order by o.id;
