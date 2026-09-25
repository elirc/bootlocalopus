-- 1. Big spenders
select c.id, c.name
from customers c
join orders o on o.customer_id = c.id
where o.status = 'paid' and o.total_cents >= 10000
order by c.id;

-- 2. Win-back audience
select c.id, c.email
from customers c
where c.marketing_opt_in
  and c.email not in (select email from suppressions)
order by c.id;
