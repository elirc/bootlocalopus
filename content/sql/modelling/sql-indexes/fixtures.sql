
create table customers (
  id serial primary key,
  name text not null,
  email text not null unique,
  country text not null,
  created_at date not null
);

create table orders (
  id serial primary key,
  customer_id int not null references customers(id) on delete cascade,
  status text not null,
  total_cents int not null,
  placed_at date not null
);

create table order_items (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  product text not null,
  quantity int not null,
  unit_cents int not null
);

insert into customers (name, email, country, created_at) values
  ('Ada',   'ada@example.com',   'GB', '2023-11-02'),
  ('Bob',   'bob@example.com',   'US', '2023-12-14'),
  ('Chen',  'chen@example.com',  'US', '2024-01-05'),
  ('Dara',  'dara@example.com',  'GB', '2024-01-20'),
  ('Elif',  'elif@example.com',  'DE', '2024-02-02'),
  ('Farid', 'farid@example.com', 'DE', '2024-02-11');

insert into orders (customer_id, status, total_cents, placed_at) values
  (1, 'paid',      12000, '2024-01-03'),
  (1, 'paid',       4500, '2024-01-28'),
  (1, 'cancelled',  9900, '2024-02-04'),
  (2, 'paid',      31000, '2024-01-11'),
  (2, 'pending',    2500, '2024-02-17'),
  (3, 'paid',       7800, '2024-02-06'),
  (3, 'paid',      15000, '2024-02-21'),
  (3, 'refunded',   3300, '2024-02-25'),
  (4, 'paid',        990, '2024-02-27'),
  (5, 'pending',   45000, '2024-02-28');

insert into order_items (order_id, product, quantity, unit_cents) values
  (1, 'Keyboard', 1, 9000), (1, 'Cable', 2, 1500),
  (2, 'Mouse',    1, 4500),
  (4, 'Monitor',  1, 28000), (4, 'Cable', 2, 1500),
  (6, 'Mouse',    1, 4500), (6, 'Mousepad', 3, 1100),
  (7, 'Monitor',  1, 15000),
  (9, 'Cable',    1, 990);
