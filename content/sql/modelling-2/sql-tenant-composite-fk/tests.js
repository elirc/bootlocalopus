const attempt = async (sql, params) => {
  await q('savepoint probe');
  try {
    await q(sql, params);
    await q('release savepoint probe');
    return null;
  } catch (e) {
    await q('rollback to savepoint probe');
    return e;
  }
};

const idOf = async (table, name) =>
  num((await q(`select id from ${table} where name = $1`, [name]))[0].id);
const ctx = async () => ({
  acme: await idOf('tenants', 'Acme'),
  globex: await idOf('tenants', 'Globex'),
  acmeSite: await idOf('projects', 'Acme website'),
  globexBilling: await idOf('projects', 'Globex billing'),
  ada: await idOf('users', 'Ada'),
  chen: await idOf('users', 'Chen'),
});
const addTask = (tenant, project, assignee) => attempt(
  "insert into tasks (tenant_id, project_id, assignee_id, title) values ($1, $2, $3, 'Do it')",
  [tenant, project, assignee],
);
const newTask = async (tenant, project, assignee) => num((await q(
  "insert into tasks (tenant_id, project_id, assignee_id, title) values ($1, $2, $3, 'Do it') returning id",
  [tenant, project, assignee],
))[0].id);

describe('same-tenant references', () => {
  it('accepts a task in its own tenant, assigned or not', async () => {
    const c = await ctx();
    expect(await addTask(c.acme, c.acmeSite, c.ada)).toBeNull();
    expect(await addTask(c.acme, c.acmeSite, null)).toBeNull();
    expect(await addTask(c.globex, c.globexBilling, c.chen)).toBeNull();
  });

  it("rejects a task in another tenant's project", async () => {
    const c = await ctx();
    const err = await addTask(c.acme, c.globexBilling, null);
    expect(err && err.code).toBe('23503');
  });

  it("rejects a task assigned to another tenant's user", async () => {
    const c = await ctx();
    const err = await addTask(c.acme, c.acmeSite, c.chen);
    expect(err && err.code).toBe('23503');
  });

  it("rejects reassigning an existing task to another tenant's user", async () => {
    const c = await ctx();
    const id = await newTask(c.acme, c.acmeSite, c.ada);
    const err = await attempt('update tasks set assignee_id = $1 where id = $2', [c.chen, id]);
    expect(err && err.code).toBe('23503');
  });

  it('rejects a project that does not exist', async () => {
    const c = await ctx();
    const err = await addTask(c.acme, 999999, null);
    expect(err && err.code).toBe('23503');
  });

  it('rejects moving a project with tasks to another tenant', async () => {
    const c = await ctx();
    await newTask(c.acme, c.acmeSite, null);
    const err = await attempt('update projects set tenant_id = $1 where id = $2', [c.globex, c.acmeSite]);
    expect(err && err.code).toBe('23503');
  });

  it('still requires tenant_id, project_id and title', async () => {
    const cols = await q(
      "select column_name, is_nullable from information_schema.columns where table_name = 'tasks' order by column_name",
    );
    expect(cols).toEqual([
      { column_name: 'assignee_id', is_nullable: 'YES' },
      { column_name: 'id', is_nullable: 'NO' },
      { column_name: 'project_id', is_nullable: 'NO' },
      { column_name: 'tenant_id', is_nullable: 'NO' },
      { column_name: 'title', is_nullable: 'NO' },
    ]);
  });
});

describe('delete policies', () => {
  it('deleting a project deletes its tasks', async () => {
    const c = await ctx();
    const t = await newTask(c.acme, c.acmeSite, c.ada);
    await q('delete from projects where id = $1', [c.acmeSite]);
    const rows = await q('select id from tasks where id = $1', [t]);
    expect(rows).toEqual([]);
  });

  it('deleting a user unassigns their tasks and keeps the tenant', async () => {
    const c = await ctx();
    const t = await newTask(c.acme, c.acmeSite, c.ada);
    expect(await attempt('delete from users where id = $1', [c.ada])).toBeNull();
    const rows = await q('select tenant_id, project_id, assignee_id from tasks where id = $1', [t]);
    expect(rows.map((r) => ({ tenant_id: num(r.tenant_id), project_id: num(r.project_id), assignee_id: r.assignee_id })))
      .toEqual([{ tenant_id: c.acme, project_id: c.acmeSite, assignee_id: null }]);
  });
});
