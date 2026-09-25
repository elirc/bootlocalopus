const doc = async (id) => (await q('select customer_document($1) as doc', [id]))[0].doc;
const customerId = async (name) => num((await q('select id from customers where name = $1', [name]))[0].id);
const orderIds = async () => (await q('select id from orders order by id')).map((r) => num(r.id));

describe('customer_document', () => {
  it('returns a JSON object with the documented keys', async () => {
    const d = await doc(await customerId('Ada'));
    expect(typeof d).toBe('object');
    expect(Object.keys(d).sort()).toEqual(['id', 'lifetimeCents', 'name', 'orderCount', 'orders']);
  });

  it('nests orders newest first, id descending on the same day, each with its items', async () => {
    const [o1, o2, o3, , o5] = await orderIds();
    const ada = await customerId('Ada');
    expect(await doc(ada)).toEqual({
      id: ada,
      name: 'Ada',
      orderCount: 4,
      lifetimeCents: 3750,
      orders: [
        { id: o3, status: 'paid', placedOn: '2024-03-05', items: [], totalCents: 0 },
        {
          id: o2, status: 'cancelled', placedOn: '2024-03-05',
          items: [{ sku: 'GADGET', qty: 1, lineCents: 5000 }], totalCents: 5000,
        },
        {
          id: o1, status: 'paid', placedOn: '2024-03-01',
          items: [{ sku: 'WIDGET', qty: 1, lineCents: 1000 }, { sku: 'BOLT', qty: 3, lineCents: 750 }],
          totalCents: 1750,
        },
        {
          id: o5, status: 'paid', placedOn: '2024-02-20',
          items: [{ sku: 'WIDGET', qty: 2, lineCents: 2000 }], totalCents: 2000,
        },
      ],
    });
  });

  it('counts only paid orders towards lifetimeCents', async () => {
    const d = await doc(await customerId('Ada'));
    expect(d.lifetimeCents).toBe(3750);
    expect(d.orderCount).toBe(4);
  });

  it('includes only the customer\'s own orders', async () => {
    const [, , , o4] = await orderIds();
    const chen = await customerId('Chen');
    expect(await doc(chen)).toEqual({
      id: chen, name: 'Chen', orderCount: 1, lifetimeCents: 800,
      orders: [{ id: o4, status: 'paid', placedOn: '2024-02-01', items: [{ sku: 'BOLT', qty: 2, lineCents: 800 }], totalCents: 800 }],
    });
  });

  it('gives a customer with no orders an empty array and zeros', async () => {
    const bob = await customerId('Bob');
    expect(await doc(bob)).toEqual({ id: bob, name: 'Bob', orderCount: 0, lifetimeCents: 0, orders: [] });
  });

  it('returns SQL NULL for a customer that does not exist', async () => {
    expect(await doc(999999)).toBeNull();
  });
});

describe('against new data', () => {
  it('keeps items in id order after one is updated', async () => {
    const [o1] = await orderIds();
    await q("update order_items set qty = 2 where order_id = $1 and sku = 'WIDGET'", [o1]);
    const d = await doc(await customerId('Ada'));
    const order = d.orders.find((o) => o.id === o1);
    expect(order.items).toEqual([{ sku: 'WIDGET', qty: 2, lineCents: 2000 }, { sku: 'BOLT', qty: 3, lineCents: 750 }]);
    expect(order.totalCents).toBe(2750);
    expect(d.lifetimeCents).toBe(4750);
  });

  it('follows a new order for a customer who had none', async () => {
    const bob = await customerId('Bob');
    const [{ id }] = await q("insert into orders (customer_id, status, placed_on) values ($1, 'paid', '2024-04-01') returning id", [bob]);
    await q("insert into order_items (order_id, sku, qty, unit_cents) values ($1, 'BOLT', 10, 250), ($1, 'NUT', 10, 50)", [id]);
    expect(await doc(bob)).toEqual({
      id: bob, name: 'Bob', orderCount: 1, lifetimeCents: 3000,
      orders: [{
        id: num(id), status: 'paid', placedOn: '2024-04-01',
        items: [{ sku: 'BOLT', qty: 10, lineCents: 2500 }, { sku: 'NUT', qty: 10, lineCents: 500 }],
        totalCents: 3000,
      }],
    });
  });
});
