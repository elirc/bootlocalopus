create table users (
  id serial primary key,
  email text not null,
  name text not null,
  constraint users_email_key unique (email)
);

insert into users (email, name) values
  ('ada@example.com',  'Ada'),
  ('bob@example.com',  'Bob'),
  ('chen@example.com', 'Chen');
