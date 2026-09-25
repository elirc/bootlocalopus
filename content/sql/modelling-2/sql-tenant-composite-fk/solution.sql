-- Redundant with the primary keys as uniqueness rules, but a composite
-- foreign key can only reference columns with a unique constraint on exactly them.
alter table projects add constraint projects_tenant_id_id_key unique (tenant_id, id);
alter table users add constraint users_tenant_id_id_key unique (tenant_id, id);

create table tasks (
  id serial primary key,
  tenant_id int not null references tenants(id),
  project_id int not null,
  assignee_id int,
  title text not null,
  -- The project must exist *in this tenant*.
  foreign key (tenant_id, project_id)
    references projects (tenant_id, id) on delete cascade,
  -- MATCH SIMPLE (the default) skips the check while assignee_id is null.
  -- SET NULL (assignee_id): null only that column; tenant_id is not null.
  foreign key (tenant_id, assignee_id)
    references users (tenant_id, id) on delete set null (assignee_id)
);

-- Foreign keys are not indexed automatically; these back the cascades and
-- the "tasks of this project" lookups.
create index tasks_project_idx on tasks (tenant_id, project_id);
create index tasks_assignee_idx on tasks (tenant_id, assignee_id) where assignee_id is not null;
