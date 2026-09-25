-- 1. Semi-join: "has at least one". EXISTS returns each customer once.
select c.id, c.name
from customers c
where exists (
  select 1
  from orders o
  where o.customer_id = c.id
    and o.status = 'paid'
    and o.total_cents >= 10000
)
order by c.id;

-- 2. Anti-joins: "has none". NOT EXISTS is unaffected by the NULL email in
--    suppressions, which would make NOT IN return no rows at all.
select c.id, c.email
from customers c
where c.marketing_opt_in
  and not exists (
    select 1 from orders o
    where o.customer_id = c.id and o.status = 'paid'
  )
  and not exists (
    select 1 from suppressions s
    where lower(s.email) = lower(c.email)
  )
order by c.id;
