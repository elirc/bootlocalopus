-- A new column, added by yesterday's migration and still NULL on most rows.
-- New sign-ups already fill it in; the backfill does the rest.
create table customers (
  id serial primary key,
  email text not null,
  email_normalized text
);

insert into customers (email, email_normalized)
select
  case g % 3
    when 0 then 'User' || g || '@Example.COM'
    when 1 then '  user' || g || '@example.com '
    else 'user' || g || '@example.com' end,
  -- Every 10th customer signed up after the deploy: already filled in, by
  -- the application, and the backfill must not touch it.
  case when g % 10 = 0 then 'kept-' || g else null end
from generate_series(1, 2000) as g;
