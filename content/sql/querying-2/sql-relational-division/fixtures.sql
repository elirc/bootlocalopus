create table employees (
  id serial primary key,
  name text not null unique,
  role text not null
);

create table trainings (
  id serial primary key,
  title text not null unique
);

create table role_requirements (
  role text not null,
  training_id int not null references trainings(id),
  primary key (role, training_id)
);

create table completions (
  id serial primary key,
  employee_id int not null references employees(id),
  training_id int not null references trainings(id),
  completed_on date not null
);

insert into trainings (title) values
  ('Security basics'),   -- 1
  ('GDPR'),              -- 2
  ('Incident response'), -- 3
  ('Public speaking');   -- 4 (optional for everyone)

insert into role_requirements (role, training_id) values
  ('engineer', 1), ('engineer', 2), ('engineer', 3),
  ('support', 1), ('support', 2);
-- 'designer' requires nothing.

insert into employees (name, role) values
  ('Ada',   'engineer'),  -- all three
  ('Bob',   'engineer'),  -- security twice, GDPR: missing 1
  ('Chen',  'engineer'),  -- security + public speaking: missing 2
  ('Dara',  'support'),   -- both
  ('Elif',  'support'),   -- nothing: missing 2
  ('Farid', 'designer'),  -- nothing required
  ('Gus',   'engineer');  -- nothing: missing 3

insert into completions (employee_id, training_id, completed_on) values
  (1, 1, '2024-01-10'), (1, 2, '2024-01-11'), (1, 3, '2024-01-12'),
  (2, 1, '2023-01-05'), (2, 1, '2024-01-05'), (2, 2, '2024-01-06'),
  (3, 1, '2024-02-01'), (3, 4, '2024-02-02'),
  (4, 1, '2024-03-01'), (4, 2, '2024-03-02'),
  (6, 4, '2024-03-03');
