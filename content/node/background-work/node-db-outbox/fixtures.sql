create table orders (
  id serial primary key,
  customer text not null,
  total_cents integer not null check (total_cents > 0),
  created_at timestamptz not null default now()
);

-- Events waiting to be published, written in the same transaction as the
-- business change they describe.
create table outbox (
  id serial primary key,
  topic text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,          -- null until the broker has accepted it
  attempts integer not null default 0,
  last_error text
);
