create table companies (
  id serial primary key,
  name text not null unique,
  country text not null
);

create table people (
  id serial primary key,
  name text not null,
  email text not null unique,
  company_id int not null references companies(id)
);

-- One row per company, taken from the data itself.
insert into companies (name, country)
select distinct company_name, company_country
from signups_raw;

-- Join back to the table we just populated to resolve the foreign key.
insert into people (name, email, company_id)
select r.person_name, r.person_email, c.id
from signups_raw r
join companies c on c.name = r.company_name;
