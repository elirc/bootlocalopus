create table customers (
  id serial primary key,
  name text not null,
  email text not null unique,
  marketing_opt_in boolean not null
);

create table orders (
  id serial primary key,
  customer_id int not null references customers(id),
  status text not null,
  total_cents int not null
);

create table suppressions (
  id serial primary key,
  email text,
  reason text not null
);

insert into customers (name, email, marketing_opt_in) values
  ('Ada',   'ada@example.com',   true),   -- 1: two big paid orders
  ('Bob',   'bob@example.com',   true),   -- 2: only small paid orders
  ('Chen',  'chen@example.com',  true),   -- 3: big order, but refunded; never paid
  ('Dara',  'dara@example.com',  true),   -- 4: never ordered, suppressed (case differs)
  ('Elif',  'elif@example.com',  false),  -- 5: never ordered, not opted in
  ('Farid', 'farid@example.com', true),   -- 6: never ordered: the audience
  ('Gus',   'gus@example.com',   true),   -- 7: only a pending order: the audience
  ('Hana',  'hana@example.com',  true);   -- 8: big paid order exactly at the line

insert into orders (customer_id, status, total_cents) values
  (1, 'paid',     25000),
  (1, 'paid',     12000),
  (1, 'refunded',  3000),
  (2, 'paid',      9999),
  (2, 'paid',      4000),
  (3, 'refunded', 50000),
  (7, 'pending',  20000),
  (8, 'paid',     10000);

insert into suppressions (email, reason) values
  ('DARA@Example.com', 'unsubscribed'),
  (null,               'import error'),
  ('someone@else.com', 'bounced');
