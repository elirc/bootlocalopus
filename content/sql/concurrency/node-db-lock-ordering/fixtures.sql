create table wallets (
  id integer primary key,
  owner text not null,
  balance_cents integer not null check (balance_cents >= 0)
);

create table payments (
  id serial primary key,
  memo text not null,
  created_at timestamptz not null default now()
);

-- One line per wallet touched by a payment; the lines of a payment sum to 0.
create table payment_lines (
  payment_id integer not null references payments(id),
  wallet_id integer not null references wallets(id),
  amount_cents integer not null check (amount_cents <> 0),
  primary key (payment_id, wallet_id)
);

insert into wallets (id, owner, balance_cents) values
  (1, 'platform', 0),
  (2, 'ada (rider)', 5000),
  (3, 'bob (driver)', 1200),
  (4, 'cy (rider)', 300),
  (5, 'dee (driver)', 0),
  (6, 'tax authority', 0);
