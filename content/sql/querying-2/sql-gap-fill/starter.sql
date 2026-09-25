-- Only the days that have data, and only products that were counted in range.
select
  p.sku,
  to_char(sc.counted_on, 'YYYY-MM-DD') as day,
  sc.quantity,
  false as is_filled
from stock_counts sc
join products p on p.id = sc.product_id
where sc.counted_on between '2024-03-01' and '2024-03-07'
order by p.sku, sc.counted_on;
