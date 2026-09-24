beforeEach(async () => { await execUser(); });

// On a 10-row fixture a sequential scan is cheapest, so a plan that ignores
// the index proves nothing. With seqscan disabled, the planner uses an index
// if one can serve the query at all, which is the question being asked.
const planFor = async (sql) => {
  await q('set enable_seqscan = off');
  try {
    const plan = await q('explain ' + sql);
    return plan.map((r) => Object.values(r)[0]).join('\n').toLowerCase();
  } finally {
    await q('reset enable_seqscan');
  }
};

const indexDef = async (name) => {
  const rows = await q('select indexdef from pg_indexes where indexname = $1', [name]);
  return rows.length ? rows[0].indexdef.toLowerCase() : null;
};

describe('the three indexes exist', () => {
  it('creates exactly the three requested indexes', async () => {
    const rows = await q(
      "select indexname from pg_indexes where schemaname = 'public' " +
      "and indexname not like '%_pkey' and indexname not like '%_key' order by indexname",
    );
    expect(rows.map((r) => r.indexname)).toEqual([
      'customers_email_lower_idx', 'orders_customer_placed_idx', 'orders_pending_idx',
    ]);
  });
});

describe('A: the composite index', () => {
  it('leads with customer_id and includes placed_at', async () => {
    const def = await indexDef('orders_customer_placed_idx');
    expect(def).toBeTruthy();
    expect(def).toContain('on public.orders');
    const columns = def.slice(def.indexOf('(') + 1, def.lastIndexOf(')'));
    expect(columns.indexOf('customer_id')).toBeLessThan(columns.indexOf('placed_at'));
  });

  it('is used for a customer lookup', async () => {
    const text = await planFor('select * from orders where customer_id = 1 order by placed_at desc');
    expect(text).toContain('orders_customer_placed_idx');
  });
});

describe('B: the partial index', () => {
  it('is partial on status = pending', async () => {
    const def = await indexDef('orders_pending_idx');
    expect(def).toBeTruthy();
    expect(def).toContain('where');
    expect(def).toContain('pending');
  });

  it('indexes placed_at so the queue can be ordered', async () => {
    const def = await indexDef('orders_pending_idx');
    expect(def).toContain('placed_at');
  });

  it('is used for the pending queue', async () => {
    const text = await planFor("select * from orders where status = 'pending' order by placed_at");
    expect(text).toContain('orders_pending_idx');
  });

  it('holds only the pending rows (2 of the 10 orders)', async () => {
    await q('analyze orders');
    const rows = await q("select reltuples::int as n from pg_class where relname = 'orders_pending_idx'");
    expect(num(rows[0].n)).toBe(2);
  });
});

describe('C: the expression index', () => {
  it('is a unique index on lower(email)', async () => {
    const def = await indexDef('customers_email_lower_idx');
    expect(def).toBeTruthy();
    expect(def).toContain('unique');
    expect(def).toContain('lower');
  });

  it('enforces case-insensitive uniqueness', async () => {
    await expect(q(
      "insert into customers (name, email, country, created_at) " +
      "values ('Fake Ada', 'ADA@example.com', 'GB', '2024-03-01')",
    )).rejects.toThrow();
  });

  it('is used for a case-insensitive lookup', async () => {
    const text = await planFor("select * from customers where lower(email) = lower('ADA@example.com')");
    expect(text).toContain('customers_email_lower_idx');
  });
});