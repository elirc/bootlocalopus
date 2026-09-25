create table tags (
  id serial primary key,
  name text not null unique
);

create table post_tags (
  -- A post's links are part of the post: they go when it goes.
  post_id int not null references posts(id) on delete cascade,
  -- A tag in use is not deleted by accident: the default (NO ACTION) refuses.
  -- Written out so the next reader knows it was a decision.
  tag_id int not null references tags(id) on delete restrict,
  tagged_at timestamptz not null default now(),
  -- The pair is the identity: tagging twice is impossible.
  primary key (post_id, tag_id)
);

-- The primary key leads with post_id, so it answers "tags of this post".
-- "Posts with this tag" needs an index that leads with tag_id; Postgres never
-- creates one for a foreign key on its own.
create index post_tags_tag_id_idx on post_tags (tag_id);
