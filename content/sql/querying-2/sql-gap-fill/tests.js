const DAYS = ['2024-03-01', '2024-03-02', '2024-03-03', '2024-03-04', '2024-03-05', '2024-03-06', '2024-03-07'];
const series = (rows, sku) => rows.filter((r) => r.sku === sku)
  .map((r) => [r.day, r.quantity === null ? null : num(r.quantity), r.is_filled]);

describe('the grid', () => {
  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['day', 'is_filled', 'quantity', 'sku']);
  });

  it('has every product on every day, in order', async () => {
    const rows = await queryUser();
    expect(rows).toHaveLength(28);
    const expected = [];
    for (const sku of ['CB-2', 'KB-1', 'MS-3', 'WC-4']) for (const d of DAYS) expected.push(`${sku} ${d}`);
    expect(rows.map((r) => `${r.sku} ${r.day}`)).toEqual(expected);
  });
});

describe('carry forward', () => {
  it('carries a count from before the range into it', async () => {
    expect(series(await queryUser(), 'KB-1')).toEqual([
      ['2024-03-01', 40, true],
      ['2024-03-02', 40, true],
      ['2024-03-03', 35, false],
      ['2024-03-04', 35, true],
      ['2024-03-05', 35, true],
      ['2024-03-06', 0, false],
      ['2024-03-07', 0, true],
    ]);
  });

  it('leaves days before the first count unknown', async () => {
    expect(series(await queryUser(), 'CB-2')).toEqual([
      ['2024-03-01', null, true],
      ['2024-03-02', 120, false],
      ['2024-03-03', 120, true],
      ['2024-03-04', 120, true],
      ['2024-03-05', 120, true],
      ['2024-03-06', 120, true],
      ['2024-03-07', 110, false],
    ]);
  });

  it('does not borrow a count from after the day', async () => {
    const ms = series(await queryUser(), 'MS-3');
    expect(ms.every(([, qty, filled]) => qty === null && filled === true)).toBe(true);
  });

  it('keeps a product that was never counted', async () => {
    const wc = series(await queryUser(), 'WC-4');
    expect(wc).toHaveLength(7);
    expect(wc.every(([, qty, filled]) => qty === null && filled === true)).toBe(true);
  });

  it('treats a zero count as a real count, not a gap', async () => {
    const kb = series(await queryUser(), 'KB-1');
    expect(kb[6]).toEqual(['2024-03-07', 0, true]);
  });
});

describe('against new data', () => {
  it('follows a count added in the middle of a gap', async () => {
    const [{ id }] = await q("select id from products where sku = 'CB-2'");
    await q("insert into stock_counts values ($1, '2024-03-04', 90)", [id]);
    const cb = series(await q(userSql), 'CB-2');
    expect(cb.slice(3, 7)).toEqual([
      ['2024-03-04', 90, false], ['2024-03-05', 90, true], ['2024-03-06', 90, true], ['2024-03-07', 110, false],
    ]);
  });

  it('adds a new product as seven rows', async () => {
    await q("insert into products (sku) values ('AA-0')");
    const rows = await q(userSql);
    expect(rows).toHaveLength(35);
    expect(rows[0].sku).toBe('AA-0');
  });
});
