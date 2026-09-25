create table orders (
  id serial primary key,
  customer text not null,
  status text not null default 'pending'
);

insert into orders (customer, status) values
  ('Ada',  'pending'),
  ('Bob',  'paid'),
  ('Chen', 'shipped'),
  ('Dara', 'delivered'),
  ('Elif', 'cancelled');
