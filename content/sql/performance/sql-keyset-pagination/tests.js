describe('the page', () => {
  it('returns exactly 3 rows', async () => {
    const rows = await queryUser();
    expect(rows).toHaveLength(3);
  });

  it('returns the rows immediately after the cursor', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => num(r.id))).toEqual([3, 2, 1]);
  });

  it('includes the tied-timestamp row with a lower id', async () => {
    // id 3 shares the cursor's timestamp and must be included; ids 4 and 5 must not.
    const rows = await queryUser();
    const ids = rows.map((r) => num(r.id));
    expect(ids).toContain(3);
    expect(ids).not.toContain(4);
    expect(ids).not.toContain(5);
  });

  it('excludes everything newer than the cursor', async () => {
    const rows = await queryUser();
    const ids = rows.map((r) => num(r.id));
    for (const newer of [6, 7, 8, 9]) expect(ids).not.toContain(newer);
  });

  it('returns id, occurred_at and kind', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['id', 'kind', 'occurred_at']);
    expect(rows[0].kind).toBe('purchase');
  });

  it('is ordered newest first', async () => {
    const rows = await queryUser();
    const times = rows.map((r) => new Date(r.occurred_at).getTime());
    expect(times[0]).toBeGreaterThanOrEqual(times[1]);
    expect(times[1]).toBeGreaterThanOrEqual(times[2]);
  });
});

describe('the technique', () => {
  it('uses keyset pagination, not OFFSET', async () => {
    // Strip comments first: "-- no offset here" is not an OFFSET clause.
    const normalised = userSql
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '')
      .toLowerCase();
    expect(normalised).not.toMatch(/\boffset\b/);
  });

  it('survives a row being inserted before the page is fetched', async () => {
    // With OFFSET, inserting a newer row shifts the window and repeats a row.
    // With a keyset cursor, the page is unchanged.
    await q("insert into events (occurred_at, kind) values ('2024-01-06 09:00:00+00', 'signup')");
    const rows = await q(userSql);
    expect(rows.map((r) => num(r.id))).toEqual([3, 2, 1]);
  });

  it('does not lose rows across a timestamp boundary', async () => {
    // The naive "occurred_at <= x and id < y" form drops id 2 and 1 here,
    // because their ids are lower but their timestamp is older.
    const rows = await queryUser();
    expect(rows.map((r) => num(r.id))).toContain(2);
    expect(rows.map((r) => num(r.id))).toContain(1);
  });
});