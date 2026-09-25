create table orders (
  id serial primary key,
  currency text not null,
  amount_cents int not null,
  placed_at timestamptz not null
);

create table fx_rates (
  currency text not null,
  effective_at timestamptz not null,
  rate_micros int not null,
  primary key (currency, effective_at)
);

insert into fx_rates (currency, effective_at, rate_micros) values
  ('EUR', '2024-06-01 00:00+00', 853000),
  ('EUR', '2024-06-03 09:00+00', 849500),
  ('EUR', '2024-06-10 00:00+00', 861000),
  ('USD', '2024-06-02 00:00+00', 786000),
  ('USD', '2024-06-05 12:00+00', 790250);

insert into orders (currency, amount_cents, placed_at) values
  ('EUR', 10000, '2024-06-02 14:00+00'),  -- 1: first EUR rate
  ('EUR', 10000, '2024-06-03 09:00+00'),  -- 2: exactly when the second rate lands
  ('EUR',  4999, '2024-06-09 23:59+00'),  -- 3: still the second rate
  ('USD', 25000, '2024-06-01 12:00+00'),  -- 4: before any USD rate
  ('USD', 12345, '2024-06-07 08:00+00'),  -- 5: second USD rate
  ('GBP',  7700, '2024-06-04 10:00+00'),  -- 6: already pounds
  ('EUR',   333, '2024-06-20 10:00+00');  -- 7: latest EUR rate
