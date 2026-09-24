create table accounts (
  id serial primary key,
  email text not null,
  created_at timestamptz not null default now()
);

insert into accounts (email) values
  ('ada@example.com'),
  ('bob@example.com'),
  ('chen@example.com');