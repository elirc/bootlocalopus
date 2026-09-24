describe('coverage', () => {
  it('returns every category exactly once', async () => {
    const rows = await queryUser();
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => num(r.id)).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['depth', 'id', 'name', 'path', 'root_name']);
  });
});

describe('depth', () => {
  it('puts roots at 0', async () => {
    const rows = await queryUser();
    const roots = rows.filter((r) => num(r.depth) === 0).map((r) => r.name).sort();
    expect(roots).toEqual(['Home', 'Tech']);
  });

  it('counts levels correctly', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(num(byName.Tech.depth)).toBe(0);
    expect(num(byName.Laptops.depth)).toBe(1);
    expect(num(byName.Gaming.depth)).toBe(2);
    expect(num(byName.Blenders.depth)).toBe(2);
    expect(num(byName.Kitchen.depth)).toBe(1);
  });
});

describe('path', () => {
  it('builds a breadcrumb from the root', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName.Tech.path).toBe('Tech');
    expect(byName.Laptops.path).toBe('Tech > Laptops');
    expect(byName.Gaming.path).toBe('Tech > Laptops > Gaming');
    expect(byName.Blenders.path).toBe('Home > Kitchen > Blenders');
  });

  it('orders by path', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.path)).toEqual([
      'Home',
      'Home > Garden',
      'Home > Kitchen',
      'Home > Kitchen > Blenders',
      'Tech',
      'Tech > Laptops',
      'Tech > Laptops > Gaming',
      'Tech > Laptops > Ultrabook',
      'Tech > Phones',
    ]);
  });
});

describe('root_name', () => {
  it('carries the top-level ancestor down every branch', async () => {
    const rows = await queryUser();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName.Gaming.root_name).toBe('Tech');
    expect(byName.Blenders.root_name).toBe('Home');
    expect(byName.Tech.root_name).toBe('Tech');
    expect(byName.Garden.root_name).toBe('Home');
  });
});

describe('it really recurses', () => {
  it('handles a branch four levels deep added after the fact', async () => {
    await q("insert into categories (name, parent_id) values ('RGB', 3)");
    const rows = await q(userSql);
    const rgb = rows.find((r) => r.name === 'RGB');
    expect(rgb).toBeTruthy();
    expect(num(rgb.depth)).toBe(3);
    expect(rgb.path).toBe('Tech > Laptops > Gaming > RGB');
    expect(rgb.root_name).toBe('Tech');
    expect(rows).toHaveLength(10);
  });

  it('handles a brand new root', async () => {
    await q("insert into categories (name, parent_id) values ('Auto', null)");
    const rows = await q(userSql);
    const auto = rows.find((r) => r.name === 'Auto');
    expect(num(auto.depth)).toBe(0);
    expect(auto.path).toBe('Auto');
    expect(auto.root_name).toBe('Auto');
  });
});