const queryFor = (customerId) => `select id, placed_at, total_cents
from orders
where customer_id = ${customerId}
order by placed_at desc, id desc
limit 20`;

/** Every node of a JSON plan, depth first. */
function nodesOf(plan) {
  const out = [plan];
  for (const child of plan.Plans || []) out.push(...nodesOf(child));
  return out;
}

/** The plan tree of `sqlText` with sequential scans discouraged. */
async function planOf(sqlText) {
  await execUser();
  await q('set local enable_seqscan = off');
  const rows = await q('explain (format json) ' + sqlText);
  const raw = rows[0]['QUERY PLAN'];
  const doc = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return doc[0].Plan;
}

const describePlan = (plan) => nodesOf(plan).map((n) => n['Node Type']).join(' -> ');

async function indexOnlyScan(customerId = 42) {
  const plan = await planOf(queryFor(customerId));
  const scan = nodesOf(plan).find((n) => n['Node Type'] === 'Index Only Scan');
  assert(scan, `expected an Index Only Scan, got: ${describePlan(plan)}`);
  return { plan, scan };
}

describe('your SQL', () => {
  it('runs', async () => {
    await execUser();
  });

  it('adds an index to orders', async () => {
    await execUser();
    const rows = await q(
      "select indexname from pg_indexes where tablename = 'orders' " +
      "and indexname not in ('orders_pkey', 'orders_customer_id_idx')",
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('the plan for customer 42', () => {
  it('is an Index Only Scan', async () => {
    await indexOnlyScan(42);
  });

  it('has no Sort node: the index already delivers rows in order', async () => {
    const plan = await planOf(queryFor(42));
    const sorts = nodesOf(plan).filter((n) => /Sort/.test(n['Node Type']));
    assert(sorts.length === 0, `the plan still sorts: ${describePlan(plan)}`);
  });

  it('seeks on customer_id (an Index Cond, not a Filter over the whole index)', async () => {
    const { scan } = await indexOnlyScan(42);
    expect(String(scan['Index Cond'] || '')).toMatch(/customer_id/);
    assert(!scan.Filter, `the scan filters rows after reading them: ${scan.Filter}`);
  });

  it('uses an index whose definition has an INCLUDE clause', async () => {
    const { scan } = await indexOnlyScan(42);
    const rows = await q('select indexdef from pg_indexes where indexname = $1', [scan['Index Name']]);
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/\bINCLUDE\b/i);
  });
});

describe('it is a general index, not one for customer 42', () => {
  it('gives the same plan shape for another customer', async () => {
    const { plan, scan } = await indexOnlyScan(7);
    expect(nodesOf(plan).some((n) => /Sort/.test(n['Node Type']))).toBe(false);
    expect(String(scan['Index Cond'] || '')).toMatch(/customer_id/);
  });
});
