const attempt = async (sql, params) => {
  await q('savepoint probe');
  try {
    await q(sql, params);
    await q('release savepoint probe');
    return null;
  } catch (e) {
    await q('rollback to savepoint probe');
    return e;
  }
};

const productId = async (name) => num((await q('select id from products where name = $1', [name]))[0].id);
const pricesOf = async (name) => (await q(
  "select price_cents, to_char(valid_from at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as vf, " +
  "to_char(valid_to at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as vt " +
  'from product_prices where product_id = $1 order by valid_from',
  [await productId(name)],
)).map((r) => [num(r.price_cents), r.vf, r.vt]);
const priced = async () => (await q(
  'select order_id, price_cents from order_prices order by order_id',
)).map((r) => [num(r.order_id), r.price_cents === null ? null : num(r.price_cents)]);
const orderIds = async () => (await q('select id from orders order by id')).map((r) => num(r.id));

describe('order_prices', () => {
  it('prices every fixture order at the price in effect when it was placed', async () => {
    const [o1, o2, o3, o4, o5, o6, o7] = await orderIds();
    expect(await priced()).toEqual([
      [o1, 9000],  // mid-February: the old keyboard price
      [o2, 9500],  // exactly at the changeover: the new price, not both
      [o3, 9000],  // one second before the changeover
      [o4, null],  // before the mouse had a price: still listed
      [o5, 4500],
      [o6, 25000], // exactly at the monitor's changeover
      [o7, 28000],
    ]);
  });

  it('has one row per order', async () => {
    const [{ n }] = await q('select count(*)::int as n from order_prices');
    const [{ m }] = await q('select count(*)::int as m from orders');
    expect(num(n)).toBe(num(m));
  });

  it('exposes order_id, product_id, placed_at and price_cents', async () => {
    const cols = await q(
      "select column_name from information_schema.columns where table_name = 'order_prices' order by column_name",
    );
    expect(cols.map((c) => c.column_name)).toEqual(['order_id', 'placed_at', 'price_cents', 'product_id']);
  });
});

describe('constraints', () => {
  it('rejects a period that ends before it starts', async () => {
    const err = await attempt(
      "insert into product_prices (product_id, price_cents, valid_from, valid_to) values ($1, 100, '2024-05-01Z', '2024-04-01Z')",
      [await productId('Webcam')],
    );
    expect(err && err.code).toBe('23514');
  });

  it('rejects an empty period', async () => {
    const err = await attempt(
      "insert into product_prices (product_id, price_cents, valid_from, valid_to) values ($1, 100, '2024-05-01Z', '2024-05-01Z')",
      [await productId('Webcam')],
    );
    expect(err && err.code).toBe('23514');
  });

  it('rejects a second current price for a product', async () => {
    const err = await attempt(
      "insert into product_prices (product_id, price_cents, valid_from) values ($1, 100, '2025-01-01Z')",
      [await productId('Mouse')],
    );
    expect(err && err.code).toBe('23505');
  });

  it('allows any number of closed versions', async () => {
    const err = await attempt(
      "insert into product_prices (product_id, price_cents, valid_from, valid_to) values ($1, 100, '2023-01-01Z', '2023-02-01Z')",
      [await productId('Mouse')],
    );
    expect(err).toBeNull();
  });
});

describe('set_price', () => {
  it('closes the current price and opens a new one at the same instant', async () => {
    await q("select set_price($1, 4900, '2024-07-01 00:00:00+00')", [await productId('Mouse')]);
    expect(await pricesOf('Mouse')).toEqual([
      [4500, '2024-01-15 00:00', '2024-07-01 00:00'],
      [4900, '2024-07-01 00:00', null],
    ]);
  });

  it('leaves older versions alone', async () => {
    await q("select set_price($1, 9900, '2024-08-01 00:00:00+00')", [await productId('Keyboard')]);
    expect(await pricesOf('Keyboard')).toEqual([
      [9000, '2024-01-01 00:00', '2024-03-01 00:00'],
      [9500, '2024-03-01 00:00', '2024-08-01 00:00'],
      [9900, '2024-08-01 00:00', null],
    ]);
  });

  it('prices new orders at the new price and old orders at the old one', async () => {
    const mouse = await productId('Mouse');
    await q("select set_price($1, 4900, '2024-07-01 00:00:00+00')", [mouse]);
    const [{ id }] = await q("insert into orders (product_id, placed_at) values ($1, '2024-07-02Z') returning id", [mouse]);
    const rows = await q('select order_id, price_cents from order_prices where product_id = $1 order by order_id', [mouse]);
    expect(rows.map((r) => (r.price_cents === null ? null : num(r.price_cents)))).toEqual([null, 4500, 4900]);
    expect(num(rows[2].order_id)).toBe(num(id));
  });

  it('gives a product with no price its first one', async () => {
    await q("select set_price($1, 6000, '2024-09-01 00:00:00+00')", [await productId('Webcam')]);
    expect(await pricesOf('Webcam')).toEqual([[6000, '2024-09-01 00:00', null]]);
  });

  it('can be called twice in a row', async () => {
    const mouse = await productId('Mouse');
    await q("select set_price($1, 4600, '2024-07-01Z')", [mouse]);
    await q("select set_price($1, 4700, '2024-08-01Z')", [mouse]);
    expect((await pricesOf('Mouse')).map((r) => r[0])).toEqual([4500, 4600, 4700]);
  });

  it('refuses a change at or before the current start, changing nothing', async () => {
    const mouse = await productId('Mouse');
    const err = await attempt("select set_price($1, 1, '2024-01-15 00:00:00+00')", [mouse]);
    expect(err && err.code).toBe('23514');
    expect(await pricesOf('Mouse')).toEqual([[4500, '2024-01-15 00:00', null]]);
    const err2 = await attempt("select set_price($1, 1, '2023-12-01 00:00:00+00')", [mouse]);
    expect(err2 && err2.code).toBe('23514');
  });
});
