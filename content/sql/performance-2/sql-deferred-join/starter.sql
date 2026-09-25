-- Page 151 of category 3. Correct, and it fetches 3,020 full rows from the
-- table to throw 3,000 of them away.
create view category_page as
select id, name, price_cents, created_at, description
from products
where category_id = 3
order by created_at desc, id desc
offset 3000
limit 20;
