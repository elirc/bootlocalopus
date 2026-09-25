-- Page 151 of category 3: skip 3,000 products, show 20.
--
-- The inner query only needs category_id, created_at and id, and all three
-- are in products_category_created_idx, so skipping 3,000 entries happens in
-- the index (an Index Only Scan). Only the 20 ids that survive go back to
-- the table for the wide columns, through the primary key.
create view category_page as
select p.id, p.name, p.price_cents, p.created_at, p.description
from (
  select id
  from products
  where category_id = 3
  order by created_at desc, id desc
  offset 3000
  limit 20
) as page
join products p on p.id = page.id
order by p.created_at desc, p.id desc;
