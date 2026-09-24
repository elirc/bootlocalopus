-- TODO
select
from orders o
join customers c on c.id = o.customer_id
where o.status = 'paid'
