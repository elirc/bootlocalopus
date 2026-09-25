create table customers (
  id serial primary key,
  name text not null
);

create table orders (
  id serial primary key,
  customer_id int not null references customers(id),
  status text not null check (status in ('draft', 'paid', 'shipped', 'cancelled')),
  placed_on date not null
);

create table order_items (
  id serial primary key,
  order_id int not null references orders(id),
  sku text not null,
  qty int not null check (qty > 0),
  unit_cents int not null
);

create table order_tags (
  order_id int not null references orders(id),
  tag text not null,
  primary key (order_id, tag)
);

insert into customers (name) values ('Ada'), ('Bob'), ('Chen');

insert into orders (customer_id, status, placed_on) values
  (1, 'paid',      '2024-01-10'),  -- 1: items, no tags
  (1, 'shipped',   '2024-02-02'),  -- 2: one item, one tag
  (1, 'draft',     '2024-02-15'),  -- 3: a draft: never shown, never counted
  (1, 'cancelled', '2024-03-01'),  -- 4: no items, no tags
  (1, 'paid',      '2024-03-09'),  -- 5: three items, one tag
  (3, 'paid',      '2024-03-10'),  -- 6: Chen's
  (1, 'paid',      '2024-03-20');  -- 7: two items, two tags
  -- Bob has no orders.

insert into order_items (order_id, sku, qty, unit_cents) values
  (1, 'WIDGET', 2, 1000),
  (1, 'BOLT',   4,  250),
  (2, 'GADGET', 1, 4000),
  (3, 'WIDGET', 9, 1000),
  (5, 'NUT',    10,  50),
  (5, 'BOLT',   2,  250),
  (5, 'WIDGET', 1, 1000),
  (6, 'GADGET', 1, 4000),
  (7, 'GIZMO',  1, 7500),
  (7, 'BOLT',   8,  250);

insert into order_tags (order_id, tag) values
  (2, 'wholesale'),
  (5, 'gift'),
  (7, 'priority'),
  (7, 'gift'),
  (6, 'gift');
