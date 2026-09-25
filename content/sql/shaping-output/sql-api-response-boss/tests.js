const page = async (customer, limit, before) =>
  (await q('select orders_page($1::int, $2::int, $3::int) as doc', [customer, limit, before]))[0].doc;
const customerId = async (name) => num((await q('select id from customers where name = $1', [name]))[0].id);
const orderIds = async () => (await q('select id from orders order by id')).map((r) => num(r.id));
const ids = (doc) => doc.orders.map((o) => o.id);

// The fixture orders, as the API should render them.
const rendered = ([o1, o2, , o4, o5, , o7]) => ({
  o7: {
    id: o7, status: 'paid', placedOn: '2024-03-20',
    items: [{ sku: 'GIZMO', qty: 1, lineCents: 7500 }, { sku: 'BOLT', qty: 8, lineCents: 2000 }],
    tags: ['gift', 'priority'], totalCents: 9500,
  },
  o5: {
    id: o5, status: 'paid', placedOn: '2024-03-09',
    items: [
      { sku: 'NUT', qty: 10, lineCents: 500 },
      { sku: 'BOLT', qty: 2, lineCents: 500 },
      { sku: 'WIDGET', qty: 1, lineCents: 1000 },
    ],
    tags: ['gift'], totalCents: 2000,
  },
  o4: { id: o4, status: 'cancelled', placedOn: '2024-03-01', items: [], tags: [], totalCents: 0 },
  o2: {
    id: o2, status: 'shipped', placedOn: '2024-02-02',
    items: [{ sku: 'GADGET', qty: 1, lineCents: 4000 }], tags: ['wholesale'], totalCents: 4000,
  },
  o1: {
    id: o1, status: 'paid', placedOn: '2024-01-10',
    items: [{ sku: 'WIDGET', qty: 2, lineCents: 2000 }, { sku: 'BOLT', qty: 4, lineCents: 1000 }],
    tags: [], totalCents: 3000,
  },
});

describe('the document', () => {
  it('has the documented keys at every level', async () => {
    const doc = await page(await customerId('Ada'), 2, null);
    expect(Object.keys(doc).sort()).toEqual(['customer', 'orders', 'page']);
    expect(Object.keys(doc.page).sort()).toEqual(['limit', 'nextBefore', 'totalOrders']);
    expect(Object.keys(doc.orders[0]).sort()).toEqual(['id', 'items', 'placedOn', 'status', 'tags', 'totalCents']);
  });

  it('renders the first page exactly', async () => {
    const ada = await customerId('Ada');
    const r = rendered(await orderIds());
    expect(await page(ada, 2, null)).toEqual({
      customer: { id: ada, name: 'Ada' },
      orders: [r.o7, r.o5],
      page: { limit: 2, nextBefore: r.o5.id, totalOrders: 5 },
    });
  });

  it('does not let tags multiply items, or items multiply tags', async () => {
    const r = rendered(await orderIds());
    const doc = await page(await customerId('Ada'), 2, null);
    expect(doc.orders[0].items).toEqual(r.o7.items);
    expect(doc.orders[0].tags).toEqual(['gift', 'priority']);
    expect(doc.orders[1].items).toHaveLength(3);
    expect(doc.orders[1].tags).toEqual(['gift']);
  });

  it('renders an order with no items and no tags with empty arrays and a zero total', async () => {
    const r = rendered(await orderIds());
    const doc = await page(await customerId('Ada'), 50, null);
    expect(doc.orders.find((o) => o.id === r.o4.id)).toEqual(r.o4);
    expect(doc.orders.find((o) => o.id === r.o1.id)).toEqual(r.o1);
  });

  it('never shows or counts drafts', async () => {
    const [, , o3] = await orderIds();
    const doc = await page(await customerId('Ada'), 50, null);
    expect(ids(doc)).not.toContain(o3);
    expect(doc.page.totalOrders).toBe(5);
  });
});

describe('paging', () => {
  it('walks every page with nextBefore and ends with null', async () => {
    const ada = await customerId('Ada');
    const r = rendered(await orderIds());
    const p2 = await page(ada, 2, r.o5.id);
    expect(p2.orders).toEqual([r.o4, r.o2]);
    expect(p2.page).toEqual({ limit: 2, nextBefore: r.o2.id, totalOrders: 5 });
    const p3 = await page(ada, 2, r.o2.id);
    expect(p3.orders).toEqual([r.o1]);
    expect(p3.page).toEqual({ limit: 2, nextBefore: null, totalOrders: 5 });
  });

  it('does not promise a next page when the last page is exactly full', async () => {
    const ada = await customerId('Ada');
    const r = rendered(await orderIds());
    const all = await page(ada, 5, null);
    expect(ids(all)).toEqual([r.o7.id, r.o5.id, r.o4.id, r.o2.id, r.o1.id]);
    expect(all.page.nextBefore).toBeNull();
    const four = await page(ada, 4, null);
    expect(four.page.nextBefore).toBe(r.o2.id);
    const tail = await page(ada, 1, r.o2.id);
    expect(ids(tail)).toEqual([r.o1.id]);
    expect(tail.page.nextBefore).toBeNull();
  });

  it('clamps the limit: missing is 20, below 1 is 1, above 50 is 50', async () => {
    const ada = await customerId('Ada');
    const r = rendered(await orderIds());
    const dflt = await page(ada, null, null);
    expect(dflt.page).toEqual({ limit: 20, nextBefore: null, totalOrders: 5 });
    expect(dflt.orders).toHaveLength(5);
    const zero = await page(ada, 0, null);
    expect(zero.page).toEqual({ limit: 1, nextBefore: r.o7.id, totalOrders: 5 });
    expect(ids(zero)).toEqual([r.o7.id]);
    expect((await page(ada, -5, null)).page.limit).toBe(1);
    expect((await page(ada, 1000, null)).page.limit).toBe(50);
  });
});

describe('edges', () => {
  it('gives a customer with no orders an empty page', async () => {
    const bob = await customerId('Bob');
    expect(await page(bob, 10, null)).toEqual({
      customer: { id: bob, name: 'Bob' },
      orders: [],
      page: { limit: 10, nextBefore: null, totalOrders: 0 },
    });
  });

  it('shows only the customer\'s own orders', async () => {
    const [, , , , , o6] = await orderIds();
    const doc = await page(await customerId('Chen'), 10, null);
    expect(ids(doc)).toEqual([o6]);
    expect(doc.page.totalOrders).toBe(1);
  });

  it('returns SQL NULL for an unknown customer', async () => {
    expect(await page(999999, 10, null)).toBeNull();
  });
});

describe('against new data', () => {
  it('pages a large history at the default limit', async () => {
    const bob = await customerId('Bob');
    const made = [];
    for (let i = 0; i < 25; i++) {
      const [{ id }] = await q("insert into orders (customer_id, status, placed_on) values ($1, 'paid', '2024-04-01') returning id", [bob]);
      made.push(num(id));
    }
    const newestFirst = [...made].reverse();
    const first = await page(bob, null, null);
    expect(ids(first)).toEqual(newestFirst.slice(0, 20));
    expect(first.page).toEqual({ limit: 20, nextBefore: newestFirst[19], totalOrders: 25 });
    const second = await page(bob, null, first.page.nextBefore);
    expect(ids(second)).toEqual(newestFirst.slice(20));
    expect(second.page.nextBefore).toBeNull();
  });

  it('keeps items in id order after one is updated, and follows a new tag', async () => {
    const r = rendered(await orderIds());
    await q("update order_items set qty = 2 where order_id = $1 and sku = 'GIZMO'", [r.o7.id]);
    await q("insert into order_tags (order_id, tag) values ($1, 'fragile')", [r.o7.id]);
    const doc = await page(await customerId('Ada'), 1, null);
    expect(doc.orders[0].items).toEqual([{ sku: 'GIZMO', qty: 2, lineCents: 15000 }, { sku: 'BOLT', qty: 8, lineCents: 2000 }]);
    expect(doc.orders[0].tags).toEqual(['fragile', 'gift', 'priority']);
    expect(doc.orders[0].totalCents).toBe(17000);
  });
});
