create table events (
  id serial primary key,
  name text not null
);

create table orders (
  id serial primary key,
  event_id integer not null references events(id),
  buyer text not null,
  hold_token text not null unique,   -- one order per hold: confirming twice finds this
  created_at timestamptz not null default now()
);

-- A seat is free, held (held_by + held_until), or sold (order_id).
-- A hold whose held_until has passed is as good as free.
create table seats (
  id serial primary key,
  event_id integer not null references events(id),
  label text not null,
  held_by text,
  held_until timestamptz,
  order_id integer references orders(id),
  unique (event_id, label),
  check ((held_by is null) = (held_until is null)),
  check (order_id is null or held_by is null)
);

insert into events (name) values ('Keynote'), ('Workshop');

insert into orders (event_id, buyer, hold_token) values (1, 'zed', 'tok-zed');

insert into seats (event_id, label, held_by, held_until, order_id) values
  (1, 'A1', null, null, null),
  (1, 'A2', null, null, null),
  (1, 'A3', null, null, null),
  (1, 'A4', 'tok-live', '2024-05-01T12:10:00Z', null),   -- someone is checking out
  (1, 'A5', null, null, 1),                               -- sold to zed
  (1, 'A6', 'tok-old', '2024-05-01T11:55:00Z', null),    -- an abandoned basket
  (2, 'B1', null, null, null),
  (2, 'B2', null, null, null);
