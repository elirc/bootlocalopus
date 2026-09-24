create table authors (
  id serial primary key,
  email text not null unique,
  name text not null,
  joined_at date not null default current_date
);

create table books (
  id serial primary key,
  author_id int not null references authors(id) on delete cascade,
  title text not null,
  price_cents int not null check (price_cents > 0),
  published_year int not null check (published_year between 1450 and 2100)
);
