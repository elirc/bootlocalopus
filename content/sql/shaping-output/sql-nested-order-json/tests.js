const orderIds = async () => (await q('select id from orders order by id')).map((r) => num(r.id));
const customerId = async (name) => num((await q('select id from customers where name = $1', [name]))[0].id);
const productId = async (sku) => num((await q('select id from products where sku = $1', [sku]))[0].id);
const bodies = (rows) => rows.map((r) => r.body);

describe('paid orders as API documents', () => {
  it('has the columns id and body, with body a JSON object', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['body', 'id']);
    expect(typeof rows[0].body).toBe('object');
    expect(Object.keys(rows[0].body).sort()).toEqual(['customer', 'id', 'items', 'placedOn', 'status', 'totalCents']);
  });

  it('lists paid orders only, newest first, id descending on the same day', async () => {
    const [o1, o2, , o4, o5] = await orderIds();
    const rows = await queryUser();
    expect(rows.map((r) => num(r.id))).toEqual([o4, o2, o1, o5]);
    expect(bodies(rows).map((b) => b.id)).toEqual([o4, o2, o1, o5]);
  });

  it('nests the customer and the lines in id order', async () => {
    const [o1] = await orderIds();
    const body = bodies(await queryUser()).find((b) => b.id === o1);
    expect(body).toEqual({
      id: o1,
      status: 'paid',
      placedOn: '2024-05-01',
      customer: { id: await customerId('Ada'), name: 'Ada' },
      items: [
        { sku: 'MS-3', name: 'Mouse', qty: 1, unitCents: 4500, lineCents: 4500 },
        { sku: 'CB-2', name: 'Cable', qty: 2, unitCents: 1500, lineCents: 3000 },
      ],
      totalCents: 7500,
    });
  });

  it('gives an order with no lines an empty array and a zero total', async () => {
    const [, , , o4] = await orderIds();
    const body = bodies(await queryUser()).find((b) => b.id === o4);
    expect(body.items).toEqual([]);
    expect(body.totalCents).toBe(0);
    expect(body.customer).toEqual({ id: await customerId('Bob'), name: 'Bob' });
  });

  it('prices lines at what was paid, not at today\'s price', async () => {
    const [, , , , o5] = await orderIds();
    const body = bodies(await queryUser()).find((b) => b.id === o5);
    expect(body.items).toEqual([{ sku: 'KB-1', name: 'Keyboard', qty: 2, unitCents: 8500, lineCents: 17000 }]);
    expect(body.totalCents).toBe(17000);
  });
});

describe('against new data', () => {
  it('keeps lines in id order after one of them is updated', async () => {
    const [o1] = await orderIds();
    // An UPDATE writes a new row version at the end of the table, so an
    // unordered aggregate would now read the Mouse line last.
    await q('update order_items set qty = 3 where order_id = $1 and product_id = $2', [o1, await productId('MS-3')]);
    const body = bodies(await q(userSql)).find((b) => b.id === o1);
    expect(body.items.map((i) => [i.sku, i.qty, i.lineCents])).toEqual([['MS-3', 3, 13500], ['CB-2', 2, 3000]]);
    expect(body.totalCents).toBe(16500);
  });

  it('picks up a newly paid order and its lines', async () => {
    const [, , o3, o4] = await orderIds();
    await q("update orders set status = 'paid' where id = $1", [o3]);
    await q('insert into order_items (order_id, product_id, qty, unit_cents) values ($1, $2, 4, 1500)', [o4, await productId('CB-2')]);
    const rows = bodies(await q(userSql));
    expect(rows[0].id).toBe(o3);
    expect(rows[0].items).toEqual([{ sku: 'MS-3', name: 'Mouse', qty: 1, unitCents: 4500, lineCents: 4500 }]);
    expect(rows[1].items).toEqual([{ sku: 'CB-2', name: 'Cable', qty: 4, unitCents: 1500, lineCents: 6000 }]);
    expect(rows[1].totalCents).toBe(6000);
  });
});
