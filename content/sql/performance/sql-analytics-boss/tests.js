const rowsByMonth = async () => {
  const rows = await queryUser();
  return { rows, byMonth: Object.fromEntries(rows.map((r) => [r.month, r])) };
};

// Paid orders in the fixture:
//   2024-01: 12000 (Ada), 4500 (Ada), 31000 (Bob)         -> 3 orders, 2 customers, 47500
//   2024-02: 7800 (Chen), 15000 (Chen), 990 (Dara)        -> 3 orders, 2 customers, 23790
//   2024-03: nothing
describe('coverage', () => {
  it('returns one row per month in the range', async () => {
    const { rows } = await rowsByMonth();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.month)).toEqual(['2024-01', '2024-02', '2024-03']);
  });

  it('includes a month with no revenue at all', async () => {
    const { byMonth } = await rowsByMonth();
    expect(byMonth['2024-03']).toBeTruthy();
    expect(num(byMonth['2024-03'].orders)).toBe(0);
    expect(num(byMonth['2024-03'].revenue_cents)).toBe(0);
    expect(num(byMonth['2024-03'].customers)).toBe(0);
    expect(num(byMonth['2024-03'].avg_order_cents)).toBe(0);
  });

  it('has the expected columns', async () => {
    const { rows } = await rowsByMonth();
    expect(Object.keys(rows[0]).sort()).toEqual([
      'avg_order_cents', 'customers', 'growth_pct', 'month',
      'orders', 'prev_month_cents', 'revenue_cents', 'running_revenue_cents',
    ]);
  });
});

describe('monthly aggregates', () => {
  it('counts paid orders per month', async () => {
    const { byMonth } = await rowsByMonth();
    expect(num(byMonth['2024-01'].orders)).toBe(3);
    expect(num(byMonth['2024-02'].orders)).toBe(3);
  });

  it('counts distinct customers, not orders', async () => {
    const { byMonth } = await rowsByMonth();
    // January: Ada twice plus Bob once = 2 customers.
    expect(num(byMonth['2024-01'].customers)).toBe(2);
    expect(num(byMonth['2024-02'].customers)).toBe(2);
  });

  it('sums only paid revenue', async () => {
    const { byMonth } = await rowsByMonth();
    expect(num(byMonth['2024-01'].revenue_cents)).toBe(47500);
    expect(num(byMonth['2024-02'].revenue_cents)).toBe(23790);
  });

  it('averages per month, rounded', async () => {
    const { byMonth } = await rowsByMonth();
    expect(num(byMonth['2024-01'].avg_order_cents)).toBe(Math.round(47500 / 3));
    expect(num(byMonth['2024-02'].avg_order_cents)).toBe(Math.round(23790 / 3));
  });
});

describe('window calculations', () => {
  it('accumulates a running revenue total', async () => {
    const { byMonth } = await rowsByMonth();
    expect(num(byMonth['2024-01'].running_revenue_cents)).toBe(47500);
    expect(num(byMonth['2024-02'].running_revenue_cents)).toBe(47500 + 23790);
    expect(num(byMonth['2024-03'].running_revenue_cents)).toBe(47500 + 23790);
  });

  it('reports the previous month', async () => {
    const { byMonth } = await rowsByMonth();
    expect(num(byMonth['2024-01'].prev_month_cents)).toBe(0);
    expect(num(byMonth['2024-02'].prev_month_cents)).toBe(47500);
    expect(num(byMonth['2024-03'].prev_month_cents)).toBe(23790);
  });

  it('computes growth to one decimal place', async () => {
    const { byMonth } = await rowsByMonth();
    const feb = Number(byMonth['2024-02'].growth_pct);
    expect(feb).toBeCloseTo(Number((((23790 - 47500) * 100) / 47500).toFixed(1)), 1);
    expect(feb).toBeLessThan(0);

    const mar = Number(byMonth['2024-03'].growth_pct);
    expect(mar).toBeCloseTo(-100, 1);
  });

  it('reports 0 growth rather than dividing by zero in the first month', async () => {
    const { byMonth } = await rowsByMonth();
    expect(Number(byMonth['2024-01'].growth_pct)).toBe(0);
  });

  it('does not truncate growth with integer division', async () => {
    // A whole-number result would betray integer maths; February's is fractional.
    const { byMonth } = await rowsByMonth();
    const feb = Number(byMonth['2024-02'].growth_pct);
    expect(Number.isInteger(feb)).toBe(false);
  });
});

describe('it responds to the data', () => {
  it('picks up a new paid order in an empty month', async () => {
    await q("insert into orders (customer_id, status, total_cents, placed_at) " +
            "values (6, 'paid', 10000, '2024-03-15')");
    const rows = await q(userSql);
    const byMonth = Object.fromEntries(rows.map((r) => [r.month, r]));
    expect(num(byMonth['2024-03'].orders)).toBe(1);
    expect(num(byMonth['2024-03'].customers)).toBe(1);
    expect(num(byMonth['2024-03'].revenue_cents)).toBe(10000);
    expect(num(byMonth['2024-03'].running_revenue_cents)).toBe(47500 + 23790 + 10000);
  });

  it('ignores a new order that is not paid', async () => {
    await q("insert into orders (customer_id, status, total_cents, placed_at) " +
            "values (6, 'pending', 99999, '2024-03-15')");
    const rows = await q(userSql);
    const byMonth = Object.fromEntries(rows.map((r) => [r.month, r]));
    expect(num(byMonth['2024-03'].revenue_cents)).toBe(0);
  });

  it('ignores orders outside the reporting range', async () => {
    await q("insert into orders (customer_id, status, total_cents, placed_at) values " +
            "(1, 'paid', 55555, '2023-12-15'), (1, 'paid', 66666, '2024-04-02')");
    const rows = await q(userSql);
    expect(rows).toHaveLength(3);
    const total = num(rows[2].running_revenue_cents);
    expect(total).toBe(47500 + 23790);
  });
});