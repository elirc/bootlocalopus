const shape = (rows) => rows.map((r) => [r.region, r.product, num(r.units), num(r.revenue_cents)]);

describe('rollup report', () => {
  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['product', 'region', 'revenue_cents', 'units']);
  });

  it('produces details, a subtotal per region, and a grand total, in order', async () => {
    expect(shape(await queryUser())).toEqual([
      ['EU', 'Keyboard', 4, 36000],
      ['EU', 'Mouse', 5, 22500],
      ['EU', 'All products', 9, 58500],
      ['NA', 'Monitor', 2, 56000],
      ['NA', 'Mouse', 4, 18000],
      ['NA', 'All products', 6, 74000],
      ['unknown', 'Cable', 6, 9000],
      ['unknown', 'Mouse', 1, 4500],
      ['unknown', 'All products', 7, 13500],
      ['All regions', 'All products', 22, 146000],
    ]);
  });

  it('has exactly one grand total row', async () => {
    const rows = await queryUser();
    expect(rows.filter((r) => r.region === 'All regions')).toHaveLength(1);
  });

  it('does not use UNION', async () => {
    const code = userSql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/\bunion\b/i.test(code)).toBe(false);
  });
});

describe('against new data', () => {
  it('sorts products correctly even when one sorts after "All products"', async () => {
    await q("insert into sales (region, product, units, revenue_cents) values ('NA', 'Adapter', 1, 1000), ('NA', 'Webcam', 1, 5000)");
    const rows = shape(await q(userSql)).filter((r) => r[0] === 'NA');
    expect(rows.map((r) => r[1])).toEqual(['Adapter', 'Monitor', 'Mouse', 'Webcam', 'All products']);
    expect(rows[4]).toEqual(['NA', 'All products', 8, 80000]);
  });

  it('adds a new region in alphabetical position', async () => {
    await q("insert into sales (region, product, units, revenue_cents) values ('APAC', 'Mouse', 2, 9000)");
    const rows = shape(await q(userSql));
    expect(rows.slice(0, 2)).toEqual([['APAC', 'Mouse', 2, 9000], ['APAC', 'All products', 2, 9000]]);
    expect(rows[rows.length - 1]).toEqual(['All regions', 'All products', 24, 155000]);
  });
});
