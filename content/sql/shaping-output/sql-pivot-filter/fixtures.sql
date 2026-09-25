create table regions (
  code text primary key,
  name text not null unique
);

create table sales (
  id serial primary key,
  region_code text not null references regions(code),
  sold_on date not null,
  amount_cents int not null
);

insert into regions (code, name) values
  ('EU',    'Europe'),
  ('NA',    'North America'),
  ('APAC',  'Asia Pacific'),
  ('LATAM', 'Latin America'),
  ('MEA',   'Middle East & Africa');

insert into sales (region_code, sold_on, amount_cents) values
  ('EU',    '2024-01-05', 10000),
  ('EU',    '2024-01-20',  5000),
  ('EU',    '2024-02-14',  7000),
  ('EU',    '2024-03-31',  3000),  -- the last day of the quarter
  ('EU',    '2023-01-10', 99999),  -- January, but last year
  ('EU',    '2024-04-01', 88888),  -- the first day of the next quarter
  ('NA',    '2024-02-01', 20000),
  ('NA',    '2024-02-29',  1500),  -- leap day
  ('NA',    '2023-12-31', 77777),
  ('APAC',  '2024-03-15', 12000),
  ('LATAM', '2024-05-05',  4000);  -- sales, but none in the quarter
  -- MEA: no sales at all.
