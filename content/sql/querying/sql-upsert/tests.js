describe('updating an existing page', () => {
  it('returns the page and its new count', async () => {
    const rows = await queryUser();
    expect(rows).toHaveLength(1);
    expect(rows[0].page).toBe('/pricing');
    expect(num(rows[0].views)).toBe(4);
  });

  it('increments from the stored value rather than replacing it', async () => {
    await execUser();
    const rows = await q("select views from page_views where page = '/pricing'");
    expect(num(rows[0].views)).toBe(4);
  });

  it('refreshes last_seen', async () => {
    await execUser();
    const rows = await q(
      "select (last_seen > now() - interval '1 minute') as fresh from page_views where page = '/pricing'",
    );
    expect(rows[0].fresh).toBe(true);
  });

  it('leaves other pages alone', async () => {
    await execUser();
    const rows = await q("select views from page_views where page = '/'");
    expect(num(rows[0].views)).toBe(10);
  });

  it('adds no new row', async () => {
    await execUser();
    const rows = await q('select count(*)::int as c from page_views');
    expect(num(rows[0].c)).toBe(2);
  });
});

describe('inserting a new page', () => {
  it('creates the row with views = 1 when it does not exist', async () => {
    await q("delete from page_views where page = '/pricing'");
    const rows = await q(userSql);
    expect(rows[0].page).toBe('/pricing');
    expect(num(rows[0].views)).toBe(1);

    const stored = await q("select views from page_views where page = '/pricing'");
    expect(num(stored[0].views)).toBe(1);
  });

  it('sets last_seen on insert too', async () => {
    await q("delete from page_views where page = '/pricing'");
    await q(userSql);
    const rows = await q(
      "select (last_seen > now() - interval '1 minute') as fresh from page_views where page = '/pricing'",
    );
    expect(rows[0].fresh).toBe(true);
  });
});

describe('it is genuinely idempotent-safe under repetition', () => {
  it('counts every call exactly once', async () => {
    await q("delete from page_views where page = '/pricing'");
    for (let i = 0; i < 5; i++) await q(userSql);
    const rows = await q("select views from page_views where page = '/pricing'");
    expect(num(rows[0].views)).toBe(5);
  });

  it('never errors on a duplicate key', async () => {
    for (let i = 0; i < 3; i++) {
      const rows = await q(userSql);
      expect(rows).toHaveLength(1);
    }
  });

  it('is a single statement, with no SELECT first', async () => {
    // Comments are not code: the starter's own "-- TODO" line must not count.
    const normalised = userSql
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '')
      .toLowerCase();
    expect(normalised).toContain('on conflict');
    expect(normalised).toContain('excluded');
    // A leading SELECT would mean the read-then-write race is still there.
    expect(normalised.trimStart().startsWith('insert')).toBe(true);
  });
});