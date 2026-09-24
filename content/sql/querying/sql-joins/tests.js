describe('the result set', () => {
  it('includes every customer, even those with no paid orders', async () => {
    const rows = await queryUser();
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.name).sort()).toEqual(['Ada', 'Bob', 'Chen', 'Dara', 'Elif', 'Farid']);
  });

  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['country', 'name', 'order_count', 'paid_cents']);
  });

  it('counts and sums only paid orders', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

    // Ada: 12000 + 4500 paid, plus a cancelled 9900 that must not count.
    expect(num(byName.Ada.order_count)).toBe(2);
    expect(num(byName.Ada.paid_cents)).toBe(16500);

    // Bob: one paid 31000, plus a pending 2500.
    expect(num(byName.Bob.order_count)).toBe(1);
    expect(num(byName.Bob.paid_cents)).toBe(31000);

    // Chen: 7800 + 15000 paid, plus a refunded 3300.
    expect(num(byName.Chen.order_count)).toBe(2);
    expect(num(byName.Chen.paid_cents)).toBe(22800);

    expect(num(byName.Dara.order_count)).toBe(1);
    expect(num(byName.Dara.paid_cents)).toBe(990);
  });

  it('reports zero, not null, for customers with no paid orders', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

    // Elif has only a pending order; Farid has none at all.
    expect(num(byName.Elif.order_count)).toBe(0);
    expect(num(byName.Elif.paid_cents)).toBe(0);
    expect(num(byName.Farid.order_count)).toBe(0);
    expect(num(byName.Farid.paid_cents)).toBe(0);
  });

  it('carries the country through', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName.Ada.country).toBe('GB');
    expect(byName.Chen.country).toBe('US');
    expect(byName.Elif.country).toBe('DE');
  });

  it('orders by paid_cents desc, then name', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.name)).toEqual(['Bob', 'Chen', 'Ada', 'Dara', 'Elif', 'Farid']);
  });
});