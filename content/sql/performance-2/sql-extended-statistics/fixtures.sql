-- Delivery addresses. A district (a postcode prefix) lies in exactly one
-- city, and a city in exactly one country: the columns are far from
-- independent, but the planner assumes they are.
create table addresses (
  id serial primary key,
  customer_id integer not null,
  line1 text not null,
  district text not null,
  city text not null,
  country text not null
);

insert into addresses (customer_id, line1, district, city, country)
select
  g,
  g || ' High Street',
  'd-' || (g % 500),
  'city-' || ((g % 500) / 10),
  'country-' || (((g % 500) / 10) % 5)
from generate_series(1, 20000) as g;

create index addresses_city_idx on addresses (city);

analyze addresses;
