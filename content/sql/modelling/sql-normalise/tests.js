beforeEach(async () => { await execUser(); });

describe('the new tables', () => {
  it('creates companies and people', async () => {
    const tables = await q(
      "select table_name from information_schema.tables where table_schema='public' order by table_name",
    );
    expect(tables.map((r) => r.table_name)).toContain('companies');
    expect(tables.map((r) => r.table_name)).toContain('people');
  });

  it('keeps company names unique', async () => {
    await expect(q("insert into companies (name, country) values ('Acme', 'GB')"))
      .rejects.toThrow();
  });

  it('requires a real company on a person', async () => {
    await expect(q(
      "insert into people (name, email, company_id) values ('Ghost', 'g@x.test', 999)",
    )).rejects.toThrow();
  });
});

describe('the data moved correctly', () => {
  it('has one row per distinct company', async () => {
    const rows = await q('select name, country from companies order by name');
    expect(rows).toEqual([
      { name: 'Acme', country: 'GB' },
      { name: 'Globex', country: 'US' },
      { name: 'Initech', country: 'DE' },
    ]);
  });

  it('keeps every person', async () => {
    const rows = await q('select count(*)::int as c from people');
    expect(num(rows[0].c)).toBe(6);
  });

  it('links each person to the right company', async () => {
    const rows = await q(
      'select p.name as person, c.name as company, c.country ' +
      'from people p join companies c on c.id = p.company_id order by p.name',
    );
    expect(rows).toEqual([
      { person: 'Ada', company: 'Acme', country: 'GB' },
      { person: 'Bob', company: 'Acme', country: 'GB' },
      { person: 'Chen', company: 'Globex', country: 'US' },
      { person: 'Dara', company: 'Acme', country: 'GB' },
      { person: 'Elif', company: 'Initech', country: 'DE' },
      { person: 'Farid', company: 'Globex', country: 'US' },
    ]);
  });

  it('preserves emails exactly', async () => {
    const rows = await q('select email from people order by email');
    expect(rows.map((r) => r.email)).toEqual([
      'ada@acme.test', 'bob@acme.test', 'chen@globex.test',
      'dara@acme.test', 'elif@initech.test', 'farid@globex.test',
    ]);
  });

  it('leaves no person unmatched', async () => {
    const rows = await q(
      'select count(*)::int as c from people p ' +
      'left join companies c on c.id = p.company_id where c.id is null',
    );
    expect(num(rows[0].c)).toBe(0);
  });

  it('stores each company exactly once, not once per person', async () => {
    const rows = await q('select count(*)::int as c from companies');
    expect(num(rows[0].c)).toBe(3);
  });
});