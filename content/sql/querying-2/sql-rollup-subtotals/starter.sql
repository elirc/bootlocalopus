select
  coalesce(region, 'All regions') as region,
  coalesce(product, 'All products') as product,
  sum(units)::int as units,
  sum(revenue_cents)::int as revenue_cents
from sales
group by rollup (region, product)
order by 1, 2;
