create table teams (
  id serial primary key,
  slug text not null,
  name text not null,
  constraint teams_slug_key unique (slug)
);

create table users (
  id serial primary key,
  email text not null,
  username text not null,
  age integer not null,
  constraint users_username_key unique (username),
  constraint users_age_check check (age >= 13)
);
-- Emails are unique regardless of case.
create unique index users_email_lower_key on users (lower(email));

create table memberships (
  team_id integer not null,
  user_id integer not null,
  role text not null,
  constraint memberships_pkey primary key (team_id, user_id),
  constraint memberships_team_id_fkey foreign key (team_id) references teams(id),
  constraint memberships_user_id_fkey foreign key (user_id) references users(id),
  constraint memberships_role_check check (role in ('member', 'admin'))
);

insert into teams (slug, name) values ('platform', 'Platform');
insert into users (email, username, age) values ('ada@example.com', 'ada', 36);
