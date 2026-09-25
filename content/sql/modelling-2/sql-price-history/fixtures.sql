create table products (
  id serial primary key,
  name text not null unique
);

create table product_prices (
  id serial primary key,
  product_id int not null references products(id),
  price_cents int not null check (price_cents > 0),
  valid_from timestamptz not null,
  valid_to timestamptz
);

create table orders (
  id serial primary key,
  product_id int not null references products(id),
  placed_at timestamptz not null
);

insert into products (name) values ('Keyboard'), ('Mouse'), ('Monitor'), ('Webcam');

insert into product_prices (product_id, price_cents, valid_from, valid_to) values
  (1, 9000,  '2024-01-01 00:00:00+00', '2024-03-01 00:00:00+00'),
  (1, 9500,  '2024-03-01 00:00:00+00', null),
  (2, 4500,  '2024-01-15 00:00:00+00', null),
  (3, 28000, '2024-02-01 00:00:00+00', '2024-04-01 00:00:00+00'),
  (3, 25000, '2024-04-01 00:00:00+00', null);
-- Webcam has no price yet.

insert into orders (product_id, placed_at) values
  (1, '2024-02-10 12:00:00+00'),
  (1, '2024-03-01 00:00:00+00'),
  (1, '2024-02-29 23:59:59+00'),
  (2, '2024-01-10 09:00:00+00'),
  (2, '2024-06-01 09:00:00+00'),
  (3, '2024-04-01 00:00:00+00'),
  (3, '2024-03-15 10:00:00+00');
