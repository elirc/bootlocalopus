const iso = (d) => (d === null || d === undefined ? null : new Date(d).toISOString());
const shape = (rows) => rows.map((r) => [
  num(r.order_id), r.currency, num(r.amount_cents), iso(r.rate_effective_at),
  r.gbp_cents === null ? null : num(r.gbp_cents),
]);
const ids = async () => (await q('select id from orders order by id')).map((r) => num(r.id));

describe('as-of conversion', () => {
  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort())
      .toEqual(['amount_cents', 'currency', 'gbp_cents', 'order_id', 'rate_effective_at']);
  });

  it('keeps every order, in order_id order', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => num(r.order_id))).toEqual(await ids());
  });

  it('converts every order at the rate in effect when it was placed', async () => {
    const [o1, o2, o3, o4, o5, o6, o7] = await ids();
    expect(shape(await queryUser())).toEqual([
      [o1, 'EUR', 10000, '2024-06-01T00:00:00.000Z', 8530],
      [o2, 'EUR', 10000, '2024-06-03T09:00:00.000Z', 8495],
      [o3, 'EUR', 4999, '2024-06-03T09:00:00.000Z', 4247],
      [o4, 'USD', 25000, null, null],
      [o5, 'USD', 12345, '2024-06-05T12:00:00.000Z', 9756],
      [o6, 'GBP', 7700, null, 7700],
      [o7, 'EUR', 333, '2024-06-10T00:00:00.000Z', 287],
    ]);
  });

  it('returns gbp_cents as an integer', async () => {
    const rows = await queryUser();
    for (const r of rows) if (r.gbp_cents !== null) expect(typeof r.gbp_cents).toBe('number');
  });
});

describe('against new data', () => {
  it('picks up a newly published rate for later orders only', async () => {
    await q("insert into fx_rates values ('USD', '2024-06-01 06:00+00', 800000)");
    const [, , , o4, o5] = await ids();
    const rows = shape(await q(userSql));
    expect(rows.find((r) => r[0] === o4)).toEqual([o4, 'USD', 25000, '2024-06-01T06:00:00.000Z', 20000]);
    expect(rows.find((r) => r[0] === o5)[4]).toBe(9756);
  });

  it('handles a currency with no rates at all', async () => {
    const [{ id }] = await q("insert into orders (currency, amount_cents, placed_at) values ('JPY', 50000, '2024-06-05Z') returning id");
    const rows = shape(await q(userSql));
    expect(rows.find((r) => r[0] === num(id))).toEqual([num(id), 'JPY', 50000, null, null]);
  });
});
