create table customers (
  id serial primary key,
  name text not null
);

create table orders (
  id serial primary key,
  customer_id int not null references customers(id),
  status text not null check (status in ('paid', 'cancelled')),
  placed_on date not null
);

create table order_items (
  id serial primary key,
  order_id int not null references orders(id),
  sku text not null,
  qty int not null check (qty > 0),
  unit_cents int not null
);

insert into customers (name) values ('Ada'), ('Bob'), ('Chen');

insert into orders (customer_id, status, placed_on) values
  (1, 'paid',      '2024-03-01'),  -- 1: two lines
  (1, 'cancelled', '2024-03-05'),  -- 2: listed, but not lifetime spend
  (1, 'paid',      '2024-03-05'),  -- 3: no lines; same day as 2
  (3, 'paid',      '2024-02-01'),  -- 4: Chen's only order
  (1, 'paid',      '2024-02-20');  -- 5: Ada's oldest
  -- Bob has no orders.

insert into order_items (order_id, sku, qty, unit_cents) values
  (1, 'WIDGET', 1, 1000),
  (1, 'BOLT',   3,  250),
  (2, 'GADGET', 1, 5000),
  (4, 'BOLT',   2,  400),
  (5, 'WIDGET', 2, 1000);
