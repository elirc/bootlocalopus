create table users (
  id serial primary key,
  handle text not null unique,
  display_name text not null,
  bio text,
  avatar_url text,
  email text not null unique,
  password_hash text not null,
  is_admin boolean not null default false,
  created_on date not null,
  deleted_at timestamptz
);

insert into users (handle, display_name, bio, avatar_url, email, password_hash, is_admin, created_on, deleted_at) values
  ('ada',  'Ada Lovelace', 'Analyst of engines', 'https://cdn.example.com/u/ada.png',
   'ada@example.com',  '$argon2id$v=19$m=65536$ada',  false, '2023-01-15', null),
  ('bob',  'Bob',          null,                 null,
   'bob@example.com',  '$argon2id$v=19$m=65536$bob',  false, '2023-06-02', null),
  ('chen', 'Chen',         'Gone',               null,
   'chen@example.com', '$argon2id$v=19$m=65536$chen', false, '2023-07-09', '2024-02-01 10:00+00'),
  ('dara', 'Dara O.',      '',                   'https://cdn.example.com/u/dara.png',
   'dara@example.com', '$argon2id$v=19$m=65536$dara', true,  '2024-01-20', null);
