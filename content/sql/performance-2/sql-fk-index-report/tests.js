beforeEach(async () => { await execUser(); });

const report = async () => (await q('select table_name, constraint_name, columns from unindexed_foreign_keys order by table_name, constraint_name'))
  .map((r) => [r.table_name, r.constraint_name, r.columns]);
const tablesIn = async () => (await report()).map((r) => r[0]);

const EXPECTED = [
  ['attachments', 'attachments_order_id_fkey', 'order_id'],
  ['categories', 'categories_parent_id_fkey', 'parent_id'],
  ['invoices', 'invoices_customer_id_fkey', 'customer_id'],
  ['membership_events', 'membership_events_tenant_id_user_id_fkey', 'tenant_id, user_id'],
  ['order_items', 'order_items_product_id_fkey', 'product_id'],
  ['payments', 'payments_order_id_fkey', 'order_id'],
  ['refunds', 'refunds_payment_id_fkey', 'payment_id'],
  ['shipments', 'shipments_order_id_fkey', 'order_id'],
];

describe('unindexed_foreign_keys on the fixture', () => {
  it('has the columns table_name, constraint_name, columns', async () => {
    const cols = await q("select column_name from information_schema.columns where table_name = 'unindexed_foreign_keys' order by ordinal_position");
    expect(cols.map((c) => c.column_name)).toEqual(['table_name', 'constraint_name', 'columns']);
  });

  it('lists exactly the uncovered foreign keys', async () => {
    expect(await report()).toEqual(EXPECTED);
  });

  it('counts an index whose leading columns are the key, in any order (primary keys included)', async () => {
    const tables = await tablesIn();
    expect(tables).not.toContain('orders');
    expect(tables).not.toContain('memberships');
    expect((await report()).filter((r) => r[0] === 'order_items').map((r) => r[2])).toEqual(['product_id']);
  });

  it('does not count a key in second position, a partial index, or an INCLUDE column', async () => {
    const tables = await tablesIn();
    for (const t of ['shipments', 'refunds', 'attachments', 'invoices']) expect(tables).toContain(t);
  });

  it('is what your last statement returns', async () => {
    const rows = (await queryUser()).map((r) => [r.table_name, r.constraint_name, r.columns]);
    expect(rows).toEqual(EXPECTED);
  });
});

describe('it is a live report, not a list', () => {
  it('picks up a new unindexed foreign key, and drops it once indexed', async () => {
    await q('create table reviews (id serial primary key, product_id integer not null references products(id), body text)');
    expect(await report()).toContainEqual(['reviews', 'reviews_product_id_fkey', 'product_id']);
    await q('create index reviews_product_idx on reviews (product_id)');
    expect(await tablesIn()).not.toContain('reviews');
  });

  it('is not fooled by an expression leading the index', async () => {
    await q('create index payments_expr_idx on payments ((amount_cents + 0), order_id)');
    expect(await tablesIn()).toContain('payments');
    await q('create index payments_order_amount_idx on payments (order_id, amount_cents)');
    expect(await tablesIn()).not.toContain('payments');
  });

  it('needs every column of a multi-column key among the leading columns', async () => {
    await q('create index membership_events_user_idx on membership_events (user_id, id)');
    expect(await tablesIn()).toContain('membership_events');
    await q('create index membership_events_pair_idx on membership_events (user_id, tenant_id)');
    expect(await tablesIn()).not.toContain('membership_events');
  });

  it('keeps the key columns in the foreign key\'s own order', async () => {
    await q(`create table grants (
      id serial primary key, user_id integer not null, tenant_id integer not null,
      foreign key (user_id, tenant_id) references tenant_users (user_id, tenant_id))`);
    const row = (await report()).find((r) => r[0] === 'grants');
    expect(row).toEqual(['grants', 'grants_user_id_tenant_id_fkey', 'user_id, tenant_id']);
  });
});
