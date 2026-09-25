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

const addAccount = async (email = 'new@x.com', plan = 'free') =>
  num((await q('insert into accounts (email, plan) values ($1, $2) returning id', [email, plan]))[0].id);
const auditOf = async (accountId) => (await q(
  'select op, actor, old_row, new_row, changed_at = now() as now_ from account_audit where account_id = $1 order by id',
  [accountId],
));
const actor = (name) => q("select set_config('app.actor', $1, true)", [name]);

describe('account_audit', () => {
  it('has the documented columns', async () => {
    const cols = await q(
      "select column_name from information_schema.columns where table_name = 'account_audit' order by column_name",
    );
    expect(cols.map((c) => c.column_name))
      .toEqual(['account_id', 'actor', 'changed_at', 'id', 'new_row', 'old_row', 'op']);
  });

  it('has no foreign key to accounts', async () => {
    const rows = await q(
      "select conname from pg_constraint where conrelid = 'account_audit'::regclass and contype = 'f'",
    );
    expect(rows).toEqual([]);
  });
});

describe('inserts', () => {
  it('writes an INSERT row with the new row and no old row', async () => {
    const id = await addAccount('ins@x.com', 'pro');
    const rows = await auditOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].op).toBe('INSERT');
    expect(rows[0].old_row).toBeNull();
    expect(rows[0].new_row).toEqual({ id, email: 'ins@x.com', plan: 'pro', balance_cents: 0 });
    expect(rows[0].now_).toBe(true);
  });

  it('writes one row per inserted account in a multi-row insert', async () => {
    const ids = (await q(
      "insert into accounts (email, plan) values ('m1@x.com', 'free'), ('m2@x.com', 'free') returning id",
    )).map((r) => num(r.id));
    for (const id of ids) expect(await auditOf(id)).toHaveLength(1);
  });
});

describe('updates', () => {
  it('records old and new rows for a real change', async () => {
    const id = await addAccount('up@x.com', 'free');
    await q("update accounts set plan = 'pro', balance_cents = 500 where id = $1", [id]);
    const rows = await auditOf(id);
    expect(rows.map((r) => r.op)).toEqual(['INSERT', 'UPDATE']);
    expect(rows[1].old_row).toEqual({ id, email: 'up@x.com', plan: 'free', balance_cents: 0 });
    expect(rows[1].new_row).toEqual({ id, email: 'up@x.com', plan: 'pro', balance_cents: 500 });
  });

  it('writes nothing for an update that changes nothing', async () => {
    const id = await addAccount('noop@x.com', 'free');
    await q("update accounts set plan = 'free', email = email where id = $1", [id]);
    expect((await auditOf(id)).map((r) => r.op)).toEqual(['INSERT']);
  });

  it('audits only the rows that changed in a multi-row update', async () => {
    const a = await addAccount('a@x.com', 'free');
    const b = await addAccount('b@x.com', 'pro');
    await q("update accounts set plan = 'pro' where id in ($1, $2)", [a, b]);
    expect((await auditOf(a)).map((r) => r.op)).toEqual(['INSERT', 'UPDATE']);
    expect((await auditOf(b)).map((r) => r.op)).toEqual(['INSERT']);
  });
});

describe('deletes', () => {
  it('records the deleted row, and the delete is allowed', async () => {
    const id = await addAccount('del@x.com', 'pro');
    await q('delete from accounts where id = $1', [id]);
    const rows = await auditOf(id);
    expect(rows.map((r) => r.op)).toEqual(['INSERT', 'DELETE']);
    expect(rows[1].old_row).toEqual({ id, email: 'del@x.com', plan: 'pro', balance_cents: 0 });
    expect(rows[1].new_row).toBeNull();
  });

  it('keeps the history after the account is gone', async () => {
    const id = await addAccount('gone@x.com');
    await q("update accounts set plan = 'pro' where id = $1", [id]);
    const err = await attempt('delete from accounts where id = $1', [id]);
    expect(err).toBeNull();
    expect(await auditOf(id)).toHaveLength(3);
  });

  it('audits pre-existing rows too', async () => {
    const [{ id }] = await q("select id from accounts where email = 'bob@example.com'");
    await q('delete from accounts where id = $1', [id]);
    const rows = await auditOf(num(id));
    expect(rows.map((r) => r.op)).toEqual(['DELETE']);
    expect(rows[0].old_row.plan).toBe('free');
  });
});

describe('actor', () => {
  it('records app.actor when the application sets it', async () => {
    await actor('alice');
    const id = await addAccount('who@x.com');
    await actor('bob');
    await q("update accounts set plan = 'pro' where id = $1", [id]);
    expect((await auditOf(id)).map((r) => r.actor)).toEqual(['alice', 'bob']);
  });

  it('records null, not an error, when app.actor was never set', async () => {
    const id = await addAccount('anon@x.com');
    const rows = await auditOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].actor === null || rows[0].actor === '').toBe(true);
  });
});
