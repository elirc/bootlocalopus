select
  -- grouping(x) = 1 means "this row is aggregated over x", which is not the
  -- same thing as x being null in the data.
  case
    when grouping(s.region) = 1 then 'All regions'
    else coalesce(s.region, 'unknown')
  end as region,
  case when grouping(s.product) = 1 then 'All products' else s.product end as product,
  sum(s.units)::int as units,
  sum(s.revenue_cents)::int as revenue_cents
from sales s
group by rollup (s.region, s.product)
order by
  grouping(s.region),
  coalesce(s.region, 'unknown'),
  grouping(s.product),
  s.product;
