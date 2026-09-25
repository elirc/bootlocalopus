create table users (
  id serial primary key,
  email text not null unique
);

create table teams (
  id serial primary key,
  name text not null
);

create table memberships (
  team_id integer not null references teams(id),
  user_id integer not null references users(id),
  primary key (team_id, user_id)
);

create table audit (
  id serial primary key,
  event text not null,
  subject text not null
);

insert into users (email) values ('taken@example.com');
