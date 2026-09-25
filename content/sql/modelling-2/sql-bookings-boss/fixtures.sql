create table rooms (
  id serial primary key,
  name text not null unique,
  capacity int not null check (capacity > 0)
);

insert into rooms (name, capacity) values
  ('Attic', 4),
  ('Boardroom', 12),
  ('Cube', 2);
