create table categories (
  id serial primary key,
  name text not null,
  parent_id int references categories(id)
);

insert into categories (id, name, parent_id) values
  (1, 'Tech',      null),
  (2, 'Laptops',   1),
  (3, 'Gaming',    2),
  (4, 'Ultrabook', 2),
  (5, 'Phones',    1),
  (6, 'Home',      null),
  (7, 'Kitchen',   6),
  (8, 'Blenders',  7),
  (9, 'Garden',    6);
select setval('categories_id_seq', 9);