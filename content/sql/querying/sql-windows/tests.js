describe('shape', () => {
  it('returns one row per paid order, not one per customer', async () => {
    const rows = await queryUser();
    expect(rows).toHaveLength(6);
  });

  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual([
      'customer_name', 'customer_total_cents', 'order_seq',
      'overall_rank', 'placed_at', 'running_cents', 'total_cents',
    ]);
  });

  it('is ordered by customer then date', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.customer_name)).toEqual(['Ada', 'Ada', 'Bob', 'Chen', 'Chen', 'Dara']);
    expect(num(rows[0].total_cents)).toBe(12000);
    expect(num(rows[1].total_cents)).toBe(4500);
  });

  it('excludes non-paid orders', async () => {
    const rows = await queryUser();
    const totals = rows.map((r) => num(r.total_cents));
    expect(totals).not.toContain(9900);   // Ada, cancelled
    expect(totals).not.toContain(2500);   // Bob, pending
    expect(totals).not.toContain(3300);   // Chen, refunded
    expect(totals).not.toContain(45000);  // Elif, pending
  });
});

describe('per-customer windows', () => {
  it('numbers each customer\'s orders from 1, oldest first', async () => {
    const rows = await queryUser();
    const ada = rows.filter((r) => r.customer_name === 'Ada');
    expect(ada.map((r) => num(r.order_seq))).toEqual([1, 2]);
    const chen = rows.filter((r) => r.customer_name === 'Chen');
    expect(chen.map((r) => num(r.order_seq))).toEqual([1, 2]);
    const dara = rows.filter((r) => r.customer_name === 'Dara');
    expect(dara.map((r) => num(r.order_seq))).toEqual([1]);
  });

  it('accumulates a running total in date order', async () => {
    const rows = await queryUser();
    const ada = rows.filter((r) => r.customer_name === 'Ada');
    expect(ada.map((r) => num(r.running_cents))).toEqual([12000, 16500]);
    const chen = rows.filter((r) => r.customer_name === 'Chen');
    expect(chen.map((r) => num(r.running_cents))).toEqual([7800, 22800]);
  });

  it('keeps same-day orders distinct: sequence and running total follow id', async () => {
    // Two paid orders for Dara on the same day. The default RANGE frame would
    // treat them as peers and give both the same running total.
    await q("insert into orders (customer_id, status, total_cents, placed_at) values " +
            "(4, 'paid', 100, '2024-03-05')");
    await q("insert into orders (customer_id, status, total_cents, placed_at) values " +
            "(4, 'paid', 200, '2024-03-05')");
    const rows = await q(userSql);
    const dara = rows.filter((r) => r.customer_name === 'Dara');
    expect(dara.map((r) => num(r.total_cents))).toEqual([990, 100, 200]);
    expect(dara.map((r) => num(r.order_seq))).toEqual([1, 2, 3]);
    expect(dara.map((r) => num(r.running_cents))).toEqual([990, 1090, 1290]);
  });

  it('repeats the customer total on every one of their rows', async () => {
    const rows = await queryUser();
    const ada = rows.filter((r) => r.customer_name === 'Ada');
    expect(ada.map((r) => num(r.customer_total_cents))).toEqual([16500, 16500]);
    const chen = rows.filter((r) => r.customer_name === 'Chen');
    expect(chen.map((r) => num(r.customer_total_cents))).toEqual([22800, 22800]);
  });

  it('running total ends at the customer total', async () => {
    const rows = await queryUser();
    for (const name of ['Ada', 'Bob', 'Chen', 'Dara']) {
      const own = rows.filter((r) => r.customer_name === name);
      const last = own[own.length - 1];
      expect(num(last.running_cents)).toBe(num(last.customer_total_cents));
    }
  });
});

describe('the global rank', () => {
  it('ranks by order value descending across every row', async () => {
    const rows = await queryUser();
    const byTotal = [...rows].sort((a, b) => num(b.total_cents) - num(a.total_cents));
    // 31000, 15000, 12000, 7800, 4500, 990
    expect(byTotal.map((r) => num(r.overall_rank))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(num(byTotal[0].total_cents)).toBe(31000);
    expect(byTotal[0].customer_name).toBe('Bob');
  });

  it('shares a rank for ties', async () => {
    // Give two customers an identical paid order and check they rank together.
    await q("insert into orders (customer_id, status, total_cents, placed_at) values " +
            "(4, 'paid', 50000, '2024-03-01'), (5, 'paid', 50000, '2024-03-02')");
    const rows = await q(userSql);
    const top = rows.filter((r) => num(r.total_cents) === 50000);
    expect(top).toHaveLength(2);
    expect(top.every((r) => num(r.overall_rank) === 1)).toBe(true);
    // rank() leaves a gap: the next value is rank 3.
    const next = rows.find((r) => num(r.total_cents) === 31000);
    expect(num(next.overall_rank)).toBe(3);
  });
});