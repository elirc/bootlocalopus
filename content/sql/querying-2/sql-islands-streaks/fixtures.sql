create table users (
  id serial primary key,
  name text not null unique
);

create table activity (
  id serial primary key,
  user_id int not null references users(id),
  happened_at timestamptz not null
);

insert into users (name) values ('Ada'), ('Bob'), ('Chen'), ('Dara');

insert into activity (user_id, happened_at) values
  -- Ada: 1st to 3rd (the 2nd twice), 5th to 6th, 10th.
  (1, '2024-03-01 08:00+00'),
  (1, '2024-03-02 09:00+00'),
  (1, '2024-03-02 21:00+00'),
  (1, '2024-03-03 07:15+00'),
  (1, '2024-03-05 12:00+00'),
  (1, '2024-03-06 12:00+00'),
  (1, '2024-03-10 12:00+00'),
  -- Bob: across the end of February in a leap year, and across midnight UTC.
  (2, '2024-02-28 10:00+00'),
  (2, '2024-02-29 10:00+00'),
  (2, '2024-03-01 23:30+00'),
  (2, '2024-03-02 00:10+00'),
  -- Chen: busy, but on one day only.
  (3, '2024-03-04 09:00+00'),
  (3, '2024-03-04 10:00+00'),
  (3, '2024-03-04 11:00+00');
  -- Dara: nothing.
