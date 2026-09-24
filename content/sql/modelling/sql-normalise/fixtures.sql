create table signups_raw (
  id serial primary key,
  person_name text not null,
  person_email text not null,
  company_name text not null,
  company_country text not null
);

insert into signups_raw (person_name, person_email, company_name, company_country) values
  ('Ada',   'ada@acme.test',    'Acme',      'GB'),
  ('Bob',   'bob@acme.test',    'Acme',      'GB'),
  ('Chen',  'chen@globex.test', 'Globex',    'US'),
  ('Dara',  'dara@acme.test',   'Acme',      'GB'),
  ('Elif',  'elif@initech.test','Initech',   'DE'),
  ('Farid', 'farid@globex.test','Globex',    'US');