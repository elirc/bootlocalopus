select
  c.name,
  c.country,
  count(o.id)::int as order_count,
  coalesce(sum(o.total_cents), 0)::int as paid_cents
from customers c
-- The status filter belongs in the JOIN, not the WHERE: in the WHERE it would
-- discard the null rows and quietly become an inner join.
left join orders o on o.customer_id = c.id and o.status = 'paid'
group by c.id, c.name, c.country
order by paid_cents desc, c.name asc;
