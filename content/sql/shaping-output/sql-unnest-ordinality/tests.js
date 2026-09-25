const call = async (ids) => (await q('select * from products_by_ids($1::int[])', [ids]))
  .map((r) => [num(r.pos), r.id === null ? null : num(r.id), r.name, r.price_cents === null ? null : num(r.price_cents), r.found]);
const pid = async (name) => num((await q('select id from products where name = $1', [name]))[0].id);

describe('products_by_ids', () => {
  it('returns the documented columns', async () => {
    const rows = await q('select * from products_by_ids($1::int[])', [[await pid('Mouse')]]);
    expect(Object.keys(rows[0]).sort()).toEqual(['found', 'id', 'name', 'pos', 'price_cents']);
  });

  it('returns rows in the order the ids were given, not id order', async () => {
    const [kb, ms, mon] = [await pid('Keyboard'), await pid('Mouse'), await pid('Monitor')];
    expect(await call([mon, kb, ms])).toEqual([
      [1, mon, 'Monitor', 28000, true],
      [2, kb, 'Keyboard', 9000, true],
      [3, ms, 'Mouse', 4500, true],
    ]);
  });

  it('keeps a placeholder for an id that does not exist', async () => {
    const [kb, cable] = [await pid('Keyboard'), await pid('Cable')];
    expect(await call([cable, 999999, kb])).toEqual([
      [1, cable, 'Cable', 1500, true],
      [2, 999999, null, null, false],
      [3, kb, 'Keyboard', 9000, true],
    ]);
  });

  it('returns a row for each occurrence of a duplicate id', async () => {
    const ms = await pid('Mouse');
    const wc = await pid('Webcam');
    expect(await call([ms, wc, ms])).toEqual([
      [1, ms, 'Mouse', 4500, true],
      [2, wc, 'Webcam', 6000, true],
      [3, ms, 'Mouse', 4500, true],
    ]);
  });

  it('treats a null element as not found', async () => {
    const ms = await pid('Mouse');
    expect(await call([null, ms])).toEqual([
      [1, null, null, null, false],
      [2, ms, 'Mouse', 4500, true],
    ]);
  });

  it('returns no rows for an empty array', async () => {
    expect(await call([])).toEqual([]);
  });

  it('handles a long list in one call', async () => {
    const real = (await q('select id from products order by id')).map((r) => num(r.id));
    const ids = [];
    for (let i = 0; i < 300; i++) ids.push(i % 7 === 0 ? -(i + 1) : real[i % real.length]);
    const rows = await call(ids);
    expect(rows).toHaveLength(300);
    expect(rows.map((r) => r[0])).toEqual(ids.map((_, i) => i + 1));
    expect(rows.map((r) => r[1])).toEqual(ids);
    expect(rows.filter((r) => !r[4]).length).toBe(ids.filter((x) => x < 0).length);
  });
});
