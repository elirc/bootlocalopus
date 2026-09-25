create table posts (
  id serial primary key,
  title text not null
);

create table photos (
  id serial primary key,
  caption text not null
);

insert into posts (title) values ('Release notes 4.2'), ('Hiring: backend engineer');
insert into photos (caption) values ('Team offsite'), ('New office');
