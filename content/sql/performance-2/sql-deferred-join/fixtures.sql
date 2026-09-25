create table products (
  id serial primary key,
  category_id integer not null,
  name text not null,
  description text not null,          -- the wide column: a few hundred bytes each
  price_cents integer not null,
  created_at timestamptz not null
);

insert into products (category_id, name, description, price_cents, created_at)
select
  g % 5 + 1,
  'Product ' || g,
  'Product ' || g || ': ' || repeat('Handmade, sustainably sourced and built to last. ', 6),
  500 + (g * 37) % 20000,
  -- Some products share a timestamp: the id breaks the tie.
  '2024-01-01T00:00:00Z'::timestamptz + (g / 3) * interval '7 minutes'
from generate_series(1, 20000) as g;

-- The listing's index: category, newest first, id as the tiebreaker.
create index products_category_created_idx on products (category_id, created_at desc, id desc);

analyze products;
