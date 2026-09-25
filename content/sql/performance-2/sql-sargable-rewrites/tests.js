beforeEach(async () => { await execUser(); });

function nodesOf(plan) {
  const out = [plan];
  for (const child of plan.Plans || []) out.push(...nodesOf(child));
  return out;
}

/** The JSON plan of `sqlText`, with sequential scans priced out: an index is used if one can be. */
async function planOf(sqlText) {
  await q('set local enable_seqscan = off');
  const rows = await q('explain (format json) ' + sqlText);
  const raw = rows[0]['QUERY PLAN'];
  const doc = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return doc[0].Plan;
}

const shape = (plan) => nodesOf(plan).map((n) => n['Node Type'] + (n['Index Name'] ? ` on ${n['Index Name']}` : '')).join(' -> ');

async function expectIndexed(view, indexName) {
  const plan = await planOf(`select id from ${view}`);
  const nodes = nodesOf(plan);
  const seq = nodes.find((n) => n['Node Type'] === 'Seq Scan');
  assert(!seq, `${view} still reads the whole table (${shape(plan)}): ${seq && seq.Filter}`);
  assert(nodes.some((n) => n['Index Name'] === indexName),
    `${view} should be answered through ${indexName}, got: ${shape(plan)}`);
}

async function ids(sqlText, params) {
  return (await q(sqlText, params)).map((r) => num(r.id));
}

const expected = {
  orders_on_day: "select id from orders where created_at >= '2024-01-15T00:00:00Z' and created_at < '2024-01-16T00:00:00Z' order by id",
  big_orders: 'select id from orders where total_cents > 5000 order by id',
  unprocessed_orders: "select id from orders where status = 'new' or status is null order by id",
  orders_2023: "select id from orders where created_at >= '2023-01-01T00:00:00Z' and created_at < '2024-01-01T00:00:00Z' order by id",
};

describe('the indexes', () => {
  it('are the same three (plus the primary key): the fix is in the queries, not in new indexes', async () => {
    const rows = await q("select indexname from pg_indexes where tablename = 'orders' order by indexname");
    expect(rows.map((r) => r.indexname)).toEqual([
      'orders_created_at_idx', 'orders_pkey', 'orders_status_idx', 'orders_total_cents_idx',
    ]);
  });
});

describe('orders_on_day', () => {
  it('returns every order placed on 15 January 2024 (UTC), midnight included, next midnight excluded', async () => {
    const got = await ids('select id from orders_on_day order by id');
    expect(got).toEqual(await ids(expected.orders_on_day));
    expect(got.length).toBeGreaterThan(10);
  });
  it('uses orders_created_at_idx', async () => { await expectIndexed('orders_on_day', 'orders_created_at_idx'); });
});

describe('big_orders', () => {
  it('returns the orders over 50.00 (5001 and 5099 cents included, 5000 not)', async () => {
    const got = await ids('select id from big_orders order by id');
    expect(got).toEqual(await ids(expected.big_orders));
    const edge = await q('select total_cents from big_orders where total_cents between 5000 and 5100 order by total_cents');
    expect(edge.map((r) => num(r.total_cents))).toContain(5001);
    expect(edge.map((r) => num(r.total_cents))).not.toContain(5000);
  });
  it('uses orders_total_cents_idx', async () => { await expectIndexed('big_orders', 'orders_total_cents_idx'); });
});

describe('unprocessed_orders', () => {
  it('returns the new orders and the ones with no status', async () => {
    expect(await ids('select id from unprocessed_orders order by id')).toEqual(await ids(expected.unprocessed_orders));
  });
  it('uses orders_status_idx', async () => { await expectIndexed('unprocessed_orders', 'orders_status_idx'); });
});

describe('orders_2023', () => {
  it('returns every order of 2023, from New Year to the last microsecond of December', async () => {
    const got = await ids('select id from orders_2023 order by id');
    expect(got).toEqual(await ids(expected.orders_2023));
  });
  it('uses orders_created_at_idx', async () => { await expectIndexed('orders_2023', 'orders_created_at_idx'); });
});

describe('the answers stay right when the data changes', () => {
  it('picks up new rows on the edges of every range', async () => {
    const inserted = await q(`insert into orders (customer_id, status, total_cents, created_at) values
      (9, null, 5001, '2024-01-15T12:00:00Z'),
      (9, 'shipped', 9000, '2023-12-31T23:00:00Z'),
      (9, 'new', 10, '2022-12-31T23:59:59Z')
      returning id`);
    const [a, b, c] = inserted.map((r) => num(r.id));
    expect(await ids('select id from orders_on_day where id = any($1::int[])', [[a, b, c]])).toEqual([a]);
    expect((await ids('select id from big_orders where id = any($1::int[]) order by id', [[a, b, c]]))).toEqual([a, b]);
    expect((await ids('select id from unprocessed_orders where id = any($1::int[]) order by id', [[a, b, c]]))).toEqual([a, c]);
    expect(await ids('select id from orders_2023 where id = any($1::int[])', [[a, b, c]])).toEqual([b]);
  });
});
