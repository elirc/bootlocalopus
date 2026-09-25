create table customers (
  id serial primary key,
  name text not null
);

create table products (
  id serial primary key,
  sku text not null unique,
  name text not null,
  price_cents int not null  -- today's price, not what anyone paid
);

create table orders (
  id serial primary key,
  customer_id int not null references customers(id),
  status text not null,
  placed_on date not null
);

create table order_items (
  id serial primary key,
  order_id int not null references orders(id),
  product_id int not null references products(id),
  qty int not null check (qty > 0),
  unit_cents int not null  -- the price at the time of the order
);

insert into customers (name) values ('Ada'), ('Bob');

insert into products (sku, name, price_cents) values
  ('KB-1', 'Keyboard', 9000),
  ('MS-3', 'Mouse', 4500),
  ('CB-2', 'Cable', 1500);

insert into orders (customer_id, status, placed_on) values
  (1, 'paid',    '2024-05-01'),  -- 1: two lines, added mouse first
  (2, 'paid',    '2024-05-03'),  -- 2: one line
  (1, 'pending', '2024-05-04'),  -- 3: not paid
  (2, 'paid',    '2024-05-03'),  -- 4: no lines yet; same day as 2
  (1, 'paid',    '2024-04-28');  -- 5: bought before the price went up

insert into order_items (order_id, product_id, qty, unit_cents) values
  (1, 2, 1, 4500),
  (1, 3, 2, 1500),
  (2, 1, 1, 9000),
  (3, 2, 1, 4500),
  (5, 1, 2, 8500);
