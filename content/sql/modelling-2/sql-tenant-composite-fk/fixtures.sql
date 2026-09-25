create table tenants (
  id serial primary key,
  name text not null
);

create table users (
  id serial primary key,
  tenant_id int not null references tenants(id),
  name text not null
);

create table projects (
  id serial primary key,
  tenant_id int not null references tenants(id),
  name text not null
);

insert into tenants (name) values ('Acme'), ('Globex');

insert into users (tenant_id, name) values
  (1, 'Ada'), (1, 'Bob'),
  (2, 'Chen');

insert into projects (tenant_id, name) values
  (1, 'Acme website'), (1, 'Acme app'),
  (2, 'Globex billing');
