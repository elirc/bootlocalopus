select
  c.country,
  count(distinct c.id)::int as customers,
  count(o.id) filter (where o.status = 'paid')::int as paid_orders,
  count(o.id) filter (where o.status = 'pending')::int as pending_orders,
  coalesce(sum(o.total_cents) filter (where o.status = 'paid'), 0)::int as paid_cents,
  coalesce(round(avg(o.total_cents) filter (where o.status = 'paid')), 0)::int as avg_paid_cents
from customers c
left join orders o on o.customer_id = c.id
group by c.country
having count(distinct c.id) >= 2
order by paid_cents desc;
