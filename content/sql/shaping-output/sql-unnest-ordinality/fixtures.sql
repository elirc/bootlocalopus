create table products (
  id serial primary key,
  name text not null,
  price_cents int not null
);

insert into products (name, price_cents) values
  ('Keyboard', 9000),
  ('Mouse', 4500),
  ('Monitor', 28000),
  ('Cable', 1500),
  ('Webcam', 6000);
