create table posts (
  id serial primary key,
  title text not null,
  published boolean not null
);

create table tags (
  id serial primary key,
  name text not null unique
);

create table post_tags (
  post_id int not null references posts(id),
  tag_id int not null references tags(id),
  primary key (post_id, tag_id)
);

create table comments (
  id serial primary key,
  post_id int not null references posts(id),
  body text not null
);

insert into posts (title, published) values
  ('Left joins that are secretly inner joins', true),  -- 1: 3 tags, 4 comments
  ('Money is not a float', true),                      -- 2: 1 tag, no comments
  ('Untagged musings', true),                          -- 3: no tags, 2 comments
  ('Draft: indexes', false),                           -- 4: unpublished
  ('Silence', true);                                   -- 5: nothing at all

insert into tags (name) values ('sql'), ('postgres'), ('joins'), ('money');

insert into post_tags (post_id, tag_id) values
  (1, 1), (1, 2), (1, 3),
  (2, 4),
  (4, 1);

insert into comments (post_id, body) values
  (1, 'Finally someone said it'), (1, 'This bit me last week'),
  (1, 'What about full joins?'), (1, 'Bookmarked'),
  (3, 'Musing back'), (3, 'Same');
