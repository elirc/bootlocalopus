In a multi-tenant app every table has a `tenant_id`, and every query filters
on it. Then an API handler takes a `project_id` from the request body without
checking whose project it is, and tenant A's task now lives in tenant B's
project. The foreign key `tasks.project_id → projects.id` is perfectly happy:
the project exists. It just belongs to someone else.

The database can make that bug impossible. Carry `tenant_id` into the foreign
key: `foreign key (tenant_id, project_id) references projects (tenant_id, id)`.
Now the referenced project must exist **in the same tenant**. A composite
foreign key needs a unique constraint on exactly those columns on the other
side — `unique (tenant_id, id)` looks redundant next to the primary key, and
is what makes this work.

Nullable references keep working: with the default `MATCH SIMPLE`, a
composite foreign key is not checked when any of its columns is null, so
"unassigned" stays expressible.

The fixture has `tenants(id, name)`, `users(id, tenant_id, name)` and
`projects(id, tenant_id, name)`, with two tenants' worth of rows.

## Task

1. Add a unique constraint on `projects (tenant_id, id)` and one on
   `users (tenant_id, id)`.
2. Create `tasks`:
   - `id` — auto-incrementing primary key
   - `tenant_id` — required, references `tenants(id)`
   - `project_id` — required; `(tenant_id, project_id)` references
     `projects (tenant_id, id)`, and deleting a project deletes its tasks
   - `assignee_id` — **nullable**; `(tenant_id, assignee_id)` references
     `users (tenant_id, id)`; deleting a user **unassigns** their tasks
     (sets `assignee_id` to null) rather than deleting them or blocking
   - `title` — text, required

Graded behaviour: a task pointing at another tenant's project, or assigned to
another tenant's user, fails with `23503`; an unassigned task is fine; moving a
project that has tasks to a different tenant fails with `23503`; deleting a
project removes its tasks; deleting a user leaves their tasks unassigned.

The trap in the last rule: `on delete set null` on a composite key nulls
**every** column of the key — including `tenant_id`, which is `not null`, so
the delete fails. Postgres 15+ lets you name the column to null:
`on delete set null (assignee_id)`.
