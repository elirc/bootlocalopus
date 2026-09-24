describe('grouping', () => {
  it('returns one row per qualifying country', async () => {
    const rows = await queryUser();
    // GB (Ada, Dara), US (Bob, Chen), DE (Elif, Farid) all have 2 customers.
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.country).sort()).toEqual(['DE', 'GB', 'US']);
  });

  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual([
      'avg_paid_cents', 'country', 'customers', 'paid_cents', 'paid_orders', 'pending_orders',
    ]);
  });

  it('counts customers without multiplying by their orders', async () => {
    const rows = await queryUser();
    for (const row of rows) expect(num(row.customers)).toBe(2);
  });
});

describe('the aggregates', () => {
  it('counts paid and pending orders separately', async () => {
    const rows = await queryUser();
    const byCountry = Object.fromEntries(rows.map((r) => [r.country, r]));

    // US: Bob 1 paid + 1 pending, Chen 2 paid + 1 refunded.
    expect(num(byCountry.US.paid_orders)).toBe(3);
    expect(num(byCountry.US.pending_orders)).toBe(1);

    // GB: Ada 2 paid + 1 cancelled, Dara 1 paid.
    expect(num(byCountry.GB.paid_orders)).toBe(3);
    expect(num(byCountry.GB.pending_orders)).toBe(0);

    // DE: Elif 1 pending, Farid nothing.
    expect(num(byCountry.DE.paid_orders)).toBe(0);
    expect(num(byCountry.DE.pending_orders)).toBe(1);
  });

  it('sums only paid orders', async () => {
    const rows = await queryUser();
    const byCountry = Object.fromEntries(rows.map((r) => [r.country, r]));
    expect(num(byCountry.US.paid_cents)).toBe(31000 + 7800 + 15000);
    expect(num(byCountry.GB.paid_cents)).toBe(12000 + 4500 + 990);
    expect(num(byCountry.DE.paid_cents)).toBe(0);
  });

  it('averages paid orders, rounded', async () => {
    const rows = await queryUser();
    const byCountry = Object.fromEntries(rows.map((r) => [r.country, r]));
    expect(num(byCountry.US.avg_paid_cents)).toBe(Math.round((31000 + 7800 + 15000) / 3));
    expect(num(byCountry.GB.avg_paid_cents)).toBe(Math.round((12000 + 4500 + 990) / 3));
  });

  it('reports 0 rather than null where there is nothing to average', async () => {
    const rows = await queryUser();
    const de = rows.find((r) => r.country === 'DE');
    expect(num(de.paid_cents)).toBe(0);
    expect(num(de.avg_paid_cents)).toBe(0);
  });

  it('orders by paid_cents descending', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.country)).toEqual(['US', 'GB', 'DE']);
  });
});

describe('HAVING', () => {
  it('excludes a country with only one customer', async () => {
    await q(
      "insert into customers (name, email, country, created_at) " +
      "values ('Solo', 'solo@example.com', 'FR', '2024-03-01')",
    );
    const rows = await q(userSql);
    expect(rows.map((r) => r.country)).not.toContain('FR');
  });

  it('includes it once it has two customers', async () => {
    await q(
      "insert into customers (name, email, country, created_at) values " +
      "('Solo', 'solo@example.com', 'FR', '2024-03-01'), " +
      "('Duo', 'duo@example.com', 'FR', '2024-03-02')",
    );
    const rows = await q(userSql);
    expect(rows.map((r) => r.country)).toContain('FR');
  });
});