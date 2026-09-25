create table accounts (
  id serial primary key,
  email text not null,
  plan text not null,
  balance_cents int not null default 0
);

insert into accounts (email, plan, balance_cents) values
  ('ada@example.com', 'pro', 1200),
  ('bob@example.com', 'free', 0);
