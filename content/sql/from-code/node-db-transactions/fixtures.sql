create table accounts (
  id text primary key,
  owner text not null,
  -- Integer cents. The CHECK is the last line of defence, not the logic:
  -- hitting it means a transfer got as far as writing a negative balance.
  balance_cents integer not null check (balance_cents >= 0)
);

create table transfers (
  id serial primary key,
  from_id text not null references accounts(id),
  to_id text not null references accounts(id),
  cents integer not null check (cents > 0),
  created_at timestamptz not null default now()
);

create table idempotency_keys (
  key text primary key,
  request jsonb not null,   -- { "from": …, "to": …, "cents": … }
  response jsonb not null,  -- what transfer() returned the first time
  created_at timestamptz not null default now()
);

insert into accounts (id, owner, balance_cents) values
  ('acc_ada', 'Ada', 50000),
  ('acc_bob', 'Bob', 12000),
  ('acc_cy',  'Cy',      0);
