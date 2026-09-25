const shape = (rows) => rows.map((r) => [
  r.region, num(r.jan_cents), num(r.feb_cents), num(r.mar_cents), num(r.q1_cents), num(r.sales),
]);
const byRegion = (rows) => Object.fromEntries(shape(rows).map((r) => [r[0], r]));

describe('Q1 2024 pivot', () => {
  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['feb_cents', 'jan_cents', 'mar_cents', 'q1_cents', 'region', 'sales']);
  });

  it('has one row per region, including regions with no sales in the quarter', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.region).sort())
      .toEqual(['Asia Pacific', 'Europe', 'Latin America', 'Middle East & Africa', 'North America']);
  });

  it('puts each sale in its month, and only 2024 Q1 sales', async () => {
    const t = byRegion(await queryUser());
    expect(t.Europe).toEqual(['Europe', 15000, 7000, 3000, 25000, 4]);
    expect(t['North America']).toEqual(['North America', 0, 21500, 0, 21500, 2]);
  });

  it('reports zeros, not nulls', async () => {
    const t = byRegion(await queryUser());
    expect(t['Latin America']).toEqual(['Latin America', 0, 0, 0, 0, 0]);
    expect(t['Middle East & Africa']).toEqual(['Middle East & Africa', 0, 0, 0, 0, 0]);
    for (const r of await queryUser()) expect(r.jan_cents).not.toBeNull();
  });

  it('matches the full report, ordered by q1_cents desc then region', async () => {
    expect(shape(await queryUser())).toEqual([
      ['Europe', 15000, 7000, 3000, 25000, 4],
      ['North America', 0, 21500, 0, 21500, 2],
      ['Asia Pacific', 0, 0, 12000, 12000, 1],
      ['Latin America', 0, 0, 0, 0, 0],
      ['Middle East & Africa', 0, 0, 0, 0, 0],
    ]);
  });
});

describe('against new data', () => {
  it('moves a region up when it sells, and keeps boundary days in the right month', async () => {
    await q("insert into sales (region_code, sold_on, amount_cents) values ('MEA', '2024-01-31', 30000), ('MEA', '2024-02-01', 100)");
    const rows = shape(await q(userSql));
    expect(rows[0]).toEqual(['Middle East & Africa', 30000, 100, 0, 30100, 2]);
  });

  it('ignores a January from another year', async () => {
    await q("insert into sales (region_code, sold_on, amount_cents) values ('APAC', '2025-01-15', 50000)");
    expect(byRegion(await q(userSql))['Asia Pacific']).toEqual(['Asia Pacific', 0, 0, 12000, 12000, 1]);
  });
});
