create table comments (
  id serial primary key,
  body text not null,
  -- One real foreign key per possible parent, each with its own delete policy.
  post_id int references posts(id) on delete cascade,
  photo_id int references photos(id) on delete cascade,
  -- The "exclusive arc": exactly one parent. num_nonnulls counts its
  -- arguments that are not null, and scales to a third parent type.
  constraint comments_one_parent check (num_nonnulls(post_id, photo_id) = 1)
);

-- Most rows have a null in one of the two columns; partial indexes skip them.
create index comments_post_id_idx on comments (post_id) where post_id is not null;
create index comments_photo_id_idx on comments (photo_id) where photo_id is not null;

-- The polymorphic shape, reconstructed for readers that want it. Left joins,
-- because each comment matches exactly one of the two parents.
create view comment_feed as
select
  c.id,
  c.body,
  case when c.post_id is not null then 'post' else 'photo' end as target_type,
  coalesce(c.post_id, c.photo_id) as target_id,
  coalesce(p.title, ph.caption) as target_label
from comments c
left join posts p on p.id = c.post_id
left join photos ph on ph.id = c.photo_id;
