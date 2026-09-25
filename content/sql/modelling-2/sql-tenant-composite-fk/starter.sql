-- The usual version: every reference exists, but nothing says it is in the
-- same tenant. Make the database enforce that.
create table tasks (
  id serial primary key,
  tenant_id int not null references tenants(id),
  project_id int not null references projects(id) on delete cascade,
  assignee_id int references users(id) on delete set null,
  title text not null
);
