create table subscriptions (
  id serial primary key,
  customer text not null,
  price_cents integer not null check (price_cents > 0),
  active boolean not null default true
);

create table invoices (
  id serial primary key,
  subscription_id integer not null references subscriptions(id),
  day date not null,
  amount_cents integer not null,
  unique (subscription_id, day)
);

-- One row per day the invoicing job has completed: the durable record that
-- stops a second run on the same day, long after any lock is gone.
create table invoice_runs (
  day date primary key,
  invoiced integer not null,
  finished_at timestamptz not null default now()
);

insert into subscriptions (customer, price_cents, active) values
  ('ada', 1200, true),
  ('bob', 900, true),
  ('cy', 1500, false),
  ('dee', 2400, true);
