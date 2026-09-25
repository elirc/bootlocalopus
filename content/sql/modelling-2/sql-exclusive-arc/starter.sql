-- The framework default. No foreign key is possible, so nothing is enforced.
-- Replace it with an exclusive arc, then add the indexes and the view.
create table comments (
  id serial primary key,
  body text not null,
  commentable_type text not null,
  commentable_id int not null
);
