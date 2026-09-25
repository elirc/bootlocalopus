create table sales (
  id serial primary key,
  region text,
  product text not null,
  units int not null,
  revenue_cents int not null
);

insert into sales (region, product, units, revenue_cents) values
  ('EU', 'Keyboard', 3, 27000),
  ('EU', 'Mouse',    5, 22500),
  ('EU', 'Keyboard', 1,  9000),
  ('NA', 'Monitor',  2, 56000),
  ('NA', 'Mouse',    4, 18000),
  (null, 'Mouse',    1,  4500),
  (null, 'Cable',    6,  9000);
