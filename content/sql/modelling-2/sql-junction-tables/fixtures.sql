create table posts (
  id serial primary key,
  title text not null
);

insert into posts (title) values
  ('Why your left join is an inner join'),
  ('Money is not a float'),
  ('Indexes are not free');
