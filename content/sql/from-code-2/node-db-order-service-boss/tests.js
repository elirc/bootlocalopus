// node-db: one shared database; every test starts from a reset.
async function inTransaction() {
  try {
    await db.query('savepoint __grader_probe');
  } catch (e) {
    return /aborted/i.test(String(e && e.message));
  }
  await db.query('release savepoint __grader_probe');
  return true;
}

async function reset() {
  if (await inTransaction()) await db.query('rollback');
  await db.exec(`
    truncate order_lines, orders restart identity cascade;
    update products set stock = case when sku = 'P03' then 2 else 10 end;
  `);
}
beforeEach(reset);
afterEach(async () => { if (await inTransaction()) await db.query('rollback'); });

/** A connection with only `query`, recording every call. `before(text, calls)` may throw. */
function spyConn(before) {
  const calls = [];
  const conn = {
    async query(text, params) {
      calls.push({ text: String(text), params: Array.isArray(params) ? params : [] });
      if (before) await before(String(text), calls);
      return db.query(text, params);
    },
  };
  return { conn, calls };
}

const isBegin = (c) => /^\s*(begin|start\s+transaction)\b/i.test(c.text);
const isCommit = (c) => /^\s*(commit|end)\b/i.test(c.text);
const isWrite = (c) => /^\s*(update|insert|delete|with)\b/i.test(c.text) && /\b(update|insert|delete)\b/i.test(c.text);

async function stock() {
  const r = await q('select sku, stock from products order by id');
  return Object.fromEntries(r.map((x) => [x.sku, x.stock]));
}
const START = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`P${String(i + 1).padStart(2, '0')}`, i === 2 ? 2 : 10]));
async function orderCount() {
  return (await q('select count(*)::int as n from orders'))[0].n;
}
async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected a rejection, but it resolved');
}
async function untouched() {
  assert(!(await inTransaction()), 'the connection was left inside a transaction');
  expect(await stock()).toEqual(START);
  expect(await orderCount()).toBe(0);
}

const order = (patch = {}) => ({
  customerId: 1,
  lines: [{ sku: 'P02', qty: 3 }, { sku: 'P01', qty: 1 }],
  idempotencyKey: 'key-1',
  ...patch,
});

describe('placeOrder', () => {
  it('places the order and resolves to { id, customerId, status, totalCents, lines }', async () => {
    const out = await solution.placeOrder(spyConn().conn, order());
    const [row] = await q('select id, customer_id, status, total_cents from orders');
    expect(out).toStrictEqual({
      id: row.id,
      customerId: 1,
      status: 'placed',
      totalCents: 700,
      lines: [
        { lineNo: 1, sku: 'P02', qty: 3, unitPriceCents: 200 },
        { lineNo: 2, sku: 'P01', qty: 1, unitPriceCents: 100 },
      ],
    });
    expect(row).toMatchObject({ customer_id: 1, status: 'placed', total_cents: 700 });
    const s = await stock();
    expect([s.P01, s.P02]).toEqual([9, 7]);
    const lines = await q('select line_no, qty, unit_price_cents from order_lines order by line_no');
    expect(lines).toEqual([{ line_no: 1, qty: 3, unit_price_cents: 200 }, { line_no: 2, qty: 1, unit_price_cents: 100 }]);
  });

  it('writes everything inside one BEGIN … COMMIT, with values as parameters', async () => {
    const { conn, calls } = spyConn();
    await solution.placeOrder(conn, order({ idempotencyKey: 'key-zq77' }));
    expect(calls.filter(isBegin)).toHaveLength(1);
    expect(calls.filter(isCommit)).toHaveLength(1);
    const b = calls.findIndex(isBegin);
    const c = calls.findIndex(isCommit);
    calls.forEach((call, i) => {
      if (isWrite(call)) assert(i > b && i < c, `a write ran outside the transaction:\n${call.text}`);
      assert(!call.text.includes('zq77') && !call.text.includes('P02'), `a value is in the SQL text:\n${call.text}`);
    });
  });

  it('uses the same number of statements for 1 line as for 30', async () => {
    const one = spyConn();
    await solution.placeOrder(one.conn, order({ lines: [{ sku: 'P05', qty: 1 }], idempotencyKey: 'k-one' }));
    const many = spyConn();
    const lines = Array.from({ length: 30 }, (_, i) => ({ sku: `P${String(i + 1).padStart(2, '0')}`, qty: 1 }));
    const out = await solution.placeOrder(many.conn, order({ lines, idempotencyKey: 'k-many' }));
    expect(out.lines).toHaveLength(30);
    expect(out.totalCents).toBe(100 * (30 * 31) / 2);
    assert(many.calls.length === one.calls.length,
      `${one.calls.length} statements for 1 line, but ${many.calls.length} for 30: batch the per-line work`);
  });

  it('replays an idempotency key: same result, no second order, no second stock change', async () => {
    const first = await solution.placeOrder(spyConn().conn, order());
    const again = await solution.placeOrder(spyConn().conn, order());
    expect(again).toStrictEqual(first);
    expect(await orderCount()).toBe(1);
    const s = await stock();
    expect([s.P01, s.P02]).toEqual([9, 7]);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('rejects unknown skus with UnknownProductError (all of them, sorted) and changes nothing', async () => {
    const err = await rejectionOf(() => solution.placeOrder(spyConn().conn,
      order({ lines: [{ sku: 'ZZ9', qty: 1 }, { sku: 'P01', qty: 1 }, { sku: 'AA1', qty: 2 }] })));
    expect(err).toBeInstanceOf(solution.UnknownProductError);
    expect(err.skus).toEqual(['AA1', 'ZZ9']);
    await untouched();
  });

  it('rejects the whole order when any line is short, listing every short sku, sorted', async () => {
    const err = await rejectionOf(() => solution.placeOrder(spyConn().conn,
      order({ lines: [{ sku: 'P04', qty: 11 }, { sku: 'P01', qty: 2 }, { sku: 'P03', qty: 3 }] })));
    expect(err).toBeInstanceOf(solution.OutOfStockError);
    expect(err.skus).toEqual(['P03', 'P04']);
    await untouched();
  });

  it('lets an order take the last unit', async () => {
    await solution.placeOrder(spyConn().conn, order({ lines: [{ sku: 'P03', qty: 2 }] }));
    expect((await stock()).P03).toBe(0);
  });

  it('maps an unknown customer to NotFoundError(\'customer\') from the foreign key, and rolls back', async () => {
    const err = await rejectionOf(() => solution.placeOrder(spyConn().conn, order({ customerId: 999 })));
    expect(err).toBeInstanceOf(solution.NotFoundError);
    expect(err.entity).toBe('customer');
    expect(err.cause && err.cause.code).toBe('23503');
    await untouched();
  });

  it('rolls back everything when writing the lines fails', async () => {
    const injected = new Error('injected: connection reset');
    const { conn } = spyConn((text) => { if (/insert\s+into\s+order_lines/i.test(text)) throw injected; });
    const err = await rejectionOf(() => solution.placeOrder(conn, order()));
    expect(err).toBe(injected);
    await untouched();
  });

  it('rejects invalid input with a RangeError before any query', async () => {
    const bad = [
      { customerId: 0 }, { customerId: '1' }, { idempotencyKey: '' }, { lines: [] },
      { lines: [{ sku: 'P01', qty: 0 }] }, { lines: [{ sku: 'P01', qty: 1.5 }] }, { lines: [{ sku: '', qty: 1 }] },
      { lines: [{ sku: 'P01', qty: 1 }, { sku: 'P01', qty: 2 }] },
      { lines: Array.from({ length: 51 }, (_, i) => ({ sku: `X${i}`, qty: 1 })) },
      { lines: 'P01' },
    ];
    for (const patch of bad) {
      const { conn, calls } = spyConn();
      const err = await rejectionOf(() => solution.placeOrder(conn, order(patch)));
      assert(err instanceof RangeError, `${JSON.stringify(patch).slice(0, 80)}: expected a RangeError, got ${err && err.name}`);
      expect(calls).toEqual([]);
    }
  });
});

describe('getOrder and cancelOrder', () => {
  it('getOrder reads back exactly what placeOrder returned, or null', async () => {
    const placed = await solution.placeOrder(spyConn().conn, order());
    expect(await solution.getOrder(spyConn().conn, placed.id)).toStrictEqual(placed);
    expect(await solution.getOrder(spyConn().conn, 999)).toBeNull();
  });

  it('cancelOrder restocks once, however many times it is called', async () => {
    const placed = await solution.placeOrder(spyConn().conn, order());
    const cancelled = await solution.cancelOrder(spyConn().conn, placed.id);
    expect(cancelled).toStrictEqual({ ...placed, status: 'cancelled' });
    expect(await stock()).toEqual(START);
    const again = await solution.cancelOrder(spyConn().conn, placed.id);
    expect(again.status).toBe('cancelled');
    expect(await stock()).toEqual(START);
    expect(await solution.cancelOrder(spyConn().conn, 999)).toBeNull();
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('leaves the order placed when restocking fails', async () => {
    const placed = await solution.placeOrder(spyConn().conn, order());
    const injected = new Error('injected');
    const { conn } = spyConn((text) => { if (/^\s*update\s+products\b/i.test(text)) throw injected; });
    const err = await rejectionOf(() => solution.cancelOrder(conn, placed.id));
    expect(err).toBe(injected);
    expect((await q('select status from orders where id = $1', [placed.id]))[0].status).toBe('placed');
    const s = await stock();
    expect([s.P01, s.P02]).toEqual([9, 7]);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });
});

describe('a day of orders', () => {
  it('keeps stock + units in placed orders constant', async () => {
    const plan = [
      () => solution.placeOrder(spyConn().conn, order({ idempotencyKey: 'd1', lines: [{ sku: 'P03', qty: 2 }, { sku: 'P07', qty: 4 }] })),
      () => solution.placeOrder(spyConn().conn, order({ idempotencyKey: 'd2', lines: [{ sku: 'P03', qty: 1 }] })),
      () => solution.placeOrder(spyConn().conn, order({ idempotencyKey: 'd3', customerId: 2, lines: [{ sku: 'P07', qty: 6 }] })),
      () => solution.cancelOrder(spyConn().conn, 1),
      () => solution.placeOrder(spyConn().conn, order({ idempotencyKey: 'd4', lines: [{ sku: 'P03', qty: 2 }, { sku: 'P07', qty: 1 }] })),
      () => solution.placeOrder(spyConn().conn, order({ idempotencyKey: 'd1', lines: [{ sku: 'P03', qty: 2 }, { sku: 'P07', qty: 4 }] })),
      () => solution.placeOrder(spyConn().conn, order({ idempotencyKey: 'd5', customerId: 404, lines: [{ sku: 'P07', qty: 1 }] })),
    ];
    const outcomes = [];
    for (const step of plan) {
      try {
        await step();
        outcomes.push('ok');
      } catch (e) {
        outcomes.push(e.name);
      }
      const r = await q(`select p.sku, p.stock + coalesce(sum(l.qty) filter (where o.status = 'placed'), 0) as total
                           from products p
                           left join order_lines l on l.product_id = p.id
                           left join orders o on o.id = l.order_id
                          where p.sku in ('P03', 'P07')
                          group by p.sku, p.stock order by p.sku`);
      expect(r.map((x) => Number(x.total))).toEqual([2, 10]);
    }
    expect(outcomes).toEqual(['ok', 'OutOfStockError', 'ok', 'ok', 'ok', 'ok', 'NotFoundError']);
    const s = await stock();
    expect([s.P03, s.P07]).toEqual([0, 3]);
  });
});
