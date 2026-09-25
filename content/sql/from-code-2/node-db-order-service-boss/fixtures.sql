create table customers (
  id serial primary key,
  email text not null unique
);

create table products (
  id serial primary key,
  sku text not null unique,
  name text not null,
  price_cents integer not null check (price_cents > 0),
  stock integer not null check (stock >= 0)
);

create table orders (
  id serial primary key,
  customer_id integer not null,
  status text not null default 'placed' check (status in ('placed', 'cancelled')),
  total_cents integer not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint orders_customer_id_fkey foreign key (customer_id) references customers(id),
  constraint orders_idempotency_key_key unique (idempotency_key)
);

create table order_lines (
  order_id integer not null references orders(id),
  line_no integer not null,
  product_id integer not null references products(id),
  qty integer not null check (qty > 0),
  unit_price_cents integer not null,
  primary key (order_id, line_no)
);

insert into customers (email) values ('ada@example.com'), ('bob@example.com');

-- P01 … P30: price 100 × n cents, stock 10 each (P03 has only 2).
insert into products (sku, name, price_cents, stock)
select 'P' || lpad(g::text, 2, '0'), 'Product ' || g, 100 * g, case when g = 3 then 2 else 10 end
from generate_series(1, 30) as g;
