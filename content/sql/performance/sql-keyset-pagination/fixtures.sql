create table events (
  id serial primary key,
  occurred_at timestamptz not null,
  kind text not null
);

insert into events (id, occurred_at, kind) values
  (1, '2024-01-01 09:00:00+00', 'signup'),
  (2, '2024-01-01 09:00:00+00', 'login'),
  (3, '2024-01-02 10:00:00+00', 'purchase'),
  (4, '2024-01-02 10:00:00+00', 'refund'),
  (5, '2024-01-02 10:00:00+00', 'login'),
  (6, '2024-01-03 11:00:00+00', 'signup'),
  (7, '2024-01-03 11:00:00+00', 'login'),
  (8, '2024-01-04 12:00:00+00', 'purchase'),
  (9, '2024-01-05 13:00:00+00', 'login');
select setval('events_id_seq', 9);