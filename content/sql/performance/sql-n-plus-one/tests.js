describe('shape', () => {
  it('returns one row per customer with paid orders', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.name)).toEqual(['Ada', 'Bob', 'Chen', 'Dara']);
  });

  it('excludes customers with no paid orders', async () => {
    const rows = await queryUser();
    const names = rows.map((r) => r.name);
    expect(names).not.toContain('Elif');
    expect(names).not.toContain('Farid');
  });

  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['name', 'order_count', 'recent_orders']);
  });
});

describe('order_count', () => {
  it('counts paid orders only', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(num(byName.Ada.order_count)).toBe(2);
    expect(num(byName.Bob.order_count)).toBe(1);
    expect(num(byName.Chen.order_count)).toBe(2);
    expect(num(byName.Dara.order_count)).toBe(1);
  });
});

describe('recent_orders', () => {
  it('is a real JSON array of objects', async () => {
    const rows = await queryUser();
    const value = rows[0].recent_orders;
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    expect(Array.isArray(parsed)).toBe(true);
    expect(typeof parsed[0]).toBe('object');
    expect(Object.keys(parsed[0]).sort()).toEqual(['id', 'placed_at', 'total_cents']);
  });

  it('lists a customer\'s paid orders newest first', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

    const ada = parse(byName.Ada.recent_orders);
    expect(ada.map((o) => o.placed_at)).toEqual(['2024-01-28', '2024-01-03']);
    expect(ada.map((o) => num(o.total_cents))).toEqual([4500, 12000]);

    const chen = parse(byName.Chen.recent_orders);
    expect(chen.map((o) => o.placed_at)).toEqual(['2024-02-21', '2024-02-06']);
  });

  it('formats the date as YYYY-MM-DD', async () => {
    const rows = await queryUser();
    const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
    for (const row of rows) {
      for (const order of parse(row.recent_orders)) {
        expect(order.placed_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('excludes non-paid orders from the array', async () => {
    const rows = await queryUser();
    const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
    const all = rows.flatMap((r) => parse(r.recent_orders)).map((o) => num(o.total_cents));
    expect(all).not.toContain(9900);
    expect(all).not.toContain(3300);
    expect(all).not.toContain(2500);
  });

  it('caps the array at 3 while order_count keeps counting', async () => {
    await q("insert into orders (customer_id, status, total_cents, placed_at) values " +
            "(1, 'paid', 100, '2024-03-01'), " +
            "(1, 'paid', 200, '2024-03-02'), " +
            "(1, 'paid', 300, '2024-03-03')");
    const rows = await q(userSql);
    const ada = rows.find((r) => r.name === 'Ada');
    const parsed = typeof ada.recent_orders === 'string'
      ? JSON.parse(ada.recent_orders) : ada.recent_orders;

    expect(num(ada.order_count)).toBe(5);
    expect(parsed).toHaveLength(3);
    expect(parsed.map((o) => o.placed_at)).toEqual(['2024-03-03', '2024-03-02', '2024-03-01']);
  });
});