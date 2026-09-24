create table notes (
  id serial primary key,
  owner_id int not null,
  title text not null,
  body text not null default '',
  created_at timestamptz not null
);

insert into notes (owner_id, title, created_at) values
  (1, 'Groceries',                      '2024-03-01 09:00:00+00'),
  (1, 'Call O''Brien about the lease',  '2024-03-02 09:00:00+00'),
  (1, 'Discount: 20% off annual plans', '2024-03-03 09:00:00+00'),
  (1, 'Snake_case vs camelCase',        '2024-03-04 09:00:00+00'),
  (1, 'Quarterly plan',                 '2024-03-04 09:00:00+00'),  -- same instant as the one above
  (1, 'Annual review prep',             '2024-03-05 09:00:00+00'),
  (2, 'Bob: salary review, 20% raise',  '2024-03-01 10:00:00+00'),
  (2, 'Bob plan for the offsite',       '2024-03-02 10:00:00+00');
