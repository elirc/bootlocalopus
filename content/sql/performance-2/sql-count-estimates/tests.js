beforeEach(async () => { await execUser(); });

async function planRows(sqlText) {
  const rows = await q('explain (format json) ' + sqlText);
  const raw = rows[0]['QUERY PLAN'];
  return (typeof raw === 'string' ? JSON.parse(raw) : raw)[0].Plan['Plan Rows'];
}
const estimate = async (sqlText) => {
  const r = await q('select estimated_count($1) as n', [sqlText]);
  return r[0].n === null ? null : num(r[0].n);
};
const tableEstimate = async (name) => {
  const r = await q('select table_row_estimate($1::regclass) as n', [name]);
  return r[0].n === null ? null : num(r[0].n);
};
const accountCount = async (id) => {
  const r = await q('select count, exact from account_event_count($1)', [id]);
  expect(r).toHaveLength(1);
  return { count: num(r[0].count), exact: r[0].exact };
};

describe('estimated_count', () => {
  it('returns the planner\'s estimate, not the true count', async () => {
    const sqlText = 'select * from events where id % 7 = 0';
    const actual = num((await q('select count(*) as n from events where id % 7 = 0'))[0].n);
    const planned = await planRows(sqlText);
    assert(planned !== actual, 'sanity: this query was chosen because its estimate is off');
    expect(await estimate(sqlText)).toBe(planned);
  });

  it('matches the plan\'s top-level Plan Rows for several queries', async () => {
    for (const sqlText of [
      'select * from events',
      'select * from events where account_id = 1',
      "select * from events where kind = 'purchase' and account_id = 42",
      "select id from events where created_at >= '2024-01-10T00:00:00Z'",
    ]) {
      expect(await estimate(sqlText)).toBe(await planRows(sqlText));
    }
  });

  it('does not run the query', async () => {
    await estimate('delete from events');
    expect(num((await q('select count(*) as n from events'))[0].n)).toBe(20000);
  });
});

describe('table_row_estimate', () => {
  it('reads the table estimate the planner keeps', async () => {
    expect(await tableEstimate('events')).toBe(20000);
    const r = await q("select reltuples::bigint as n from pg_class where relname = 'events'");
    expect(await tableEstimate('events')).toBe(num(r[0].n));
  });

  it('is NULL for a table that has never been analyzed (unknown, not 0)', async () => {
    expect(await tableEstimate('imports')).toBeNull();
  });

  it('follows ANALYZE', async () => {
    await q('analyze imports');
    expect(await tableEstimate('imports')).toBe(500);
    await q("insert into events (account_id, kind, created_at) select 7, 'view', now() from generate_series(1, 1000)");
    expect(await tableEstimate('events')).toBe(20000);
    await q('analyze events');
    expect(await tableEstimate('events')).toBe(21000);
  });
});

describe('account_event_count', () => {
  it('is exact for an account with up to 1000 events', async () => {
    expect(await accountCount(42)).toEqual({ count: 100, exact: true });
    expect(await accountCount(99999)).toEqual({ count: 0, exact: true });
    await q("insert into events (account_id, kind, created_at) select 500, 'view', now() from generate_series(1, 1000)");
    expect(await accountCount(500)).toEqual({ count: 1000, exact: true });
  });

  it('is the planner\'s estimate, flagged inexact, above 1000', async () => {
    const big = await accountCount(1);
    expect(big.exact).toBe(false);
    expect(big.count).toBe(await planRows('select * from events where account_id = 1'));
    await q("insert into events (account_id, kind, created_at) select 501, 'view', now() from generate_series(1, 1001)");
    const justOver = await accountCount(501);
    expect(justOver.exact).toBe(false);
    expect(justOver.count).toBe(await planRows('select * from events where account_id = 501'));
  });
});
