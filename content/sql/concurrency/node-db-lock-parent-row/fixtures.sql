create table events (
  id serial primary key,
  name text not null,
  capacity integer not null check (capacity >= 0)
);

-- There is no "seats booked" column: the rule "the bookings of an event add
-- up to at most its capacity" spans many rows, so no CHECK can express it.
create table bookings (
  id serial primary key,
  event_id integer not null references events(id),
  customer text not null,
  seats integer not null check (seats > 0),
  created_at timestamptz not null default now()
);

insert into events (name, capacity) values
  ('Postgres workshop', 10),
  ('Meetup', 3),
  ('Sold-out talk', 2);

insert into bookings (event_id, customer, seats) values
  (1, 'ada', 4),
  (1, 'bob', 2),
  (3, 'cy', 2);
