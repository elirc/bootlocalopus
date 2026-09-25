create table users (
  id serial primary key,
  email text not null unique,
  display_name text not null,
  bio text,                                  -- optional: null means "no bio"
  credit_cents integer not null default 0,   -- only billing code may change this
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into users (email, display_name, bio, credit_cents, created_at, updated_at) values
  ('ada@example.com', 'Ada', 'Writes compilers.', 500, '2024-01-01T09:00:00Z', '2024-01-01T09:00:00Z'),
  ('bob@example.com', 'Bob', null, 0, '2024-01-02T09:00:00Z', '2024-01-02T09:00:00Z'),
  ('cy@example.com', 'Cy', 'Plays the oboe.', 1200, '2024-01-03T09:00:00Z', '2024-01-03T09:00:00Z');
