beforeEach(async () => { await execUser(); });

describe('the columns', () => {
  it('adds plan as not null with a default', async () => {
    const rows = await q(
      "select is_nullable, column_default, data_type from information_schema.columns " +
      "where table_name = 'accounts' and column_name = 'plan'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('NO');
    expect(String(rows[0].column_default)).toContain('free');
    expect(rows[0].data_type).toBe('text');
  });

  it('adds last_seen_at as nullable', async () => {
    const rows = await q(
      "select is_nullable, data_type from information_schema.columns " +
      "where table_name = 'accounts' and column_name = 'last_seen_at'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('YES');
    expect(rows[0].data_type).toBe('timestamp with time zone');
  });
});

describe('the existing data survived', () => {
  it('keeps all three rows with their ids', async () => {
    const rows = await q('select id, email from accounts order by id');
    expect(rows.map((r) => num(r.id))).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.email)).toEqual([
      'ada@example.com', 'bob@example.com', 'chen@example.com',
    ]);
  });

  it('backfilled every row to free', async () => {
    const rows = await q('select distinct plan from accounts');
    expect(rows).toEqual([{ plan: 'free' }]);
  });

  it('kept created_at', async () => {
    const rows = await q('select count(*)::int as c from accounts where created_at is not null');
    expect(num(rows[0].c)).toBe(3);
  });
});

describe('the new rules', () => {
  it('applies the default to new rows', async () => {
    const rows = await q(
      "insert into accounts (email) values ('new@example.com') returning plan",
    );
    expect(rows[0].plan).toBe('free');
  });

  it('accepts the allowed plans', async () => {
    for (const plan of ['free', 'pro', 'enterprise']) {
      const rows = await q(
        "insert into accounts (email, plan) values ('" + plan + "@x.com', '" + plan + "') returning plan",
      );
      expect(rows[0].plan).toBe(plan);
    }
  });

  it('rejects an unknown plan', async () => {
    await expect(q("insert into accounts (email, plan) values ('x@x.com', 'platinum')"))
      .rejects.toThrow();
  });

  it('rejects a null plan explicitly', async () => {
    await expect(q("insert into accounts (email, plan) values ('x@x.com', null)"))
      .rejects.toThrow();
  });

  it('names the check constraint', async () => {
    const rows = await q(
      "select conname from pg_constraint where conname = 'accounts_plan_valid'",
    );
    expect(rows).toHaveLength(1);
  });

  it('left the check constraint validated, not just NOT VALID', async () => {
    // NOT VALID only covers new writes. Until VALIDATE runs, existing rows
    // are unchecked and the planner cannot rely on the constraint.
    const rows = await q(
      "select convalidated from pg_constraint where conname = 'accounts_plan_valid'",
    );
    expect(rows[0].convalidated).toBe(true);
  });
});

describe('the case-insensitive email index', () => {
  it('exists with the right name and is unique', async () => {
    const rows = await q(
      "select indexname, indexdef from pg_indexes " +
      "where tablename = 'accounts' and indexname = 'accounts_email_lower_idx'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef.toLowerCase()).toContain('unique');
    expect(rows[0].indexdef.toLowerCase()).toContain('lower');
  });

  it('blocks a differently-cased duplicate', async () => {
    await expect(q("insert into accounts (email) values ('ADA@example.com')"))
      .rejects.toThrow();
  });

  it('still allows genuinely different emails', async () => {
    const rows = await q(
      "insert into accounts (email) values ('someone.else@example.com') returning id",
    );
    expect(num(rows[0].id)).toBeGreaterThan(3);
  });
});