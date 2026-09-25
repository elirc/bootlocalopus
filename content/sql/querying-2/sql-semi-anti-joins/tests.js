const results = async () => {
  const all = (await execUser()).filter((r) => r.fields && r.fields.length);
  expect(all.length >= 2).toBe(true);
  const [spenders, audience] = all.slice(-2).map((r) => r.rows.map((row) => ({ ...row, id: num(row.id) })));
  return { spenders, audience };
};
// Re-runs the learner's two statements after the test changed the data.
const rerun = async () => {
  const all = (await db.exec(userSql)).filter((r) => r.fields && r.fields.length);
  const [spenders, audience] = all.slice(-2).map((r) => r.rows.map((row) => ({ ...row, id: num(row.id) })));
  return { spenders, audience };
};
const idOf = async (name) => num((await q('select id from customers where name = $1', [name]))[0].id);

describe('1. big spenders', () => {
  it('has the columns id and name', async () => {
    const { spenders } = await results();
    expect(Object.keys(spenders[0]).sort()).toEqual(['id', 'name']);
  });

  it('lists each qualifying customer once', async () => {
    const { spenders } = await results();
    expect(spenders.map((r) => r.name)).toEqual(['Ada', 'Hana']);
  });

  it('counts only paid orders, and includes exactly 10000', async () => {
    const { spenders } = await results();
    expect(spenders.map((r) => r.name)).not.toContain('Chen');
    expect(spenders.map((r) => r.name)).toContain('Hana');
  });

  it('still lists Ada once after a third big order', async () => {
    await q("insert into orders (customer_id, status, total_cents) values ($1, 'paid', 30000)", [await idOf('Ada')]);
    const { spenders } = await rerun();
    expect(spenders.filter((r) => r.name === 'Ada')).toHaveLength(1);
  });
});

describe('2. win-back audience', () => {
  it('has the columns id and email', async () => {
    const { audience } = await results();
    expect(Object.keys(audience[0]).sort()).toEqual(['email', 'id']);
  });

  it('is not emptied by a NULL in the suppression list', async () => {
    const { audience } = await results();
    expect(audience.length).toBeGreaterThan(0);
  });

  it('is exactly the opted-in, never-paid, unsuppressed customers', async () => {
    const { audience } = await results();
    expect(audience.map((r) => r.email)).toEqual(['chen@example.com', 'farid@example.com', 'gus@example.com']);
  });

  it('suppresses regardless of letter case', async () => {
    const { audience } = await results();
    expect(audience.map((r) => r.email)).not.toContain('dara@example.com');
  });

  it('drops a customer the moment they pay', async () => {
    await q("insert into orders (customer_id, status, total_cents) values ($1, 'paid', 500)", [await idOf('Farid')]);
    const { audience } = await rerun();
    expect(audience.map((r) => r.email)).toEqual(['chen@example.com', 'gus@example.com']);
  });

  it('drops a customer who is suppressed later', async () => {
    await q("insert into suppressions (email, reason) values ('Gus@EXAMPLE.com', 'complaint')");
    const { audience } = await rerun();
    expect(audience.map((r) => r.email)).toEqual(['chen@example.com', 'farid@example.com']);
  });
});
