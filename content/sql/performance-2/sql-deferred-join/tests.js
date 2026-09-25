beforeEach(async () => { await execUser(); });

function nodesOf(plan) {
  const out = [plan];
  for (const child of plan.Plans || []) out.push(...nodesOf(child));
  return out;
}

/**
 * EXPLAIN ANALYZE of the view: the actual rows each node produced.
 *
 * The sandbox cannot run VACUUM, so no page of products is marked
 * all-visible and the planner prices an Index Only Scan like a plain Index
 * Scan. Telling the planner every page is all-visible (inside this test's
 * transaction, which is rolled back) makes it plan as it would on a
 * vacuumed production table.
 */
async function analyzedPlan() {
  await q("update pg_class set relallvisible = relpages where relname = 'products'");
  await q('set local enable_seqscan = off');
  const rows = await q('explain (analyze, format json) select * from category_page');
  const raw = rows[0]['QUERY PLAN'];
  return (typeof raw === 'string' ? JSON.parse(raw) : raw)[0].Plan;
}

const shape = (plan) => nodesOf(plan)
  .map((n) => `${n['Node Type']}${n['Index Name'] ? ` on ${n['Index Name']}` : ''} (rows=${n['Actual Rows']} loops=${n['Actual Loops']})`)
  .join(' -> ');

const NAIVE = `select id, name, price_cents, created_at, description
  from products where category_id = 3
  order by created_at desc, id desc offset 3000 limit 20`;

describe('category_page', () => {
  it('uses the existing indexes (a wider index is not the fix)', async () => {
    const rows = await q("select indexname from pg_indexes where tablename = 'products' order by indexname");
    expect(rows.map((r) => r.indexname)).toEqual(['products_category_created_idx', 'products_pkey']);
  });

  it('returns page 151 of category 3: the same 20 rows, in the same order, as the plain query', async () => {
    const got = await q('select id, name, price_cents, created_at, description from category_page');
    const want = await q(NAIVE);
    expect(got.length).toBe(20);
    expect(got.map((r) => num(r.id))).toEqual(want.map((r) => num(r.id)));
    expect(got).toEqual(want);
  });

  it('skips the first 3,000 rows inside the index (an Index Only Scan)', async () => {
    const plan = await analyzedPlan();
    const scan = nodesOf(plan).find((n) => n['Node Type'] === 'Index Only Scan' && n['Index Name'] === 'products_category_created_idx');
    assert(scan, `expected an Index Only Scan on products_category_created_idx, got: ${shape(plan)}`);
  });

  it('reads only the 20 rows it shows from the table', async () => {
    const plan = await analyzedPlan();
    const heapReads = nodesOf(plan)
      .filter((n) => n['Relation Name'] === 'products' && n['Node Type'] !== 'Index Only Scan')
      .reduce((sum, n) => sum + n['Actual Rows'] * n['Actual Loops'], 0);
    assert(heapReads <= 20, `the plan fetched ${heapReads} full rows from products: ${shape(plan)}`);
  });
});
