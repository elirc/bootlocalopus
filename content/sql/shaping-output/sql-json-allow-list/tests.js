const PUBLIC = ['avatar_url', 'bio', 'created_on', 'display_name', 'handle', 'id'];
const byHandle = (rows) => Object.fromEntries(rows.map((r) => [r.profile && r.profile.handle, r.profile]));
const liveIds = async () => (await q('select id from users where deleted_at is null order by id')).map((r) => num(r.id));
const idOf = async (handle) => num((await q('select id from users where handle = $1', [handle]))[0].id);

describe('public profiles', () => {
  it('has the columns id and profile, with profile a JSON object', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['id', 'profile']);
    expect(typeof rows[0].profile).toBe('object');
  });

  it('lists live users only, in id order', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => num(r.id))).toEqual(await liveIds());
    expect(rows.map((r) => r.profile.handle)).toEqual(['ada', 'bob', 'dara']);
  });

  it('builds the full profile from public columns only', async () => {
    const ada = byHandle(await queryUser()).ada;
    expect(ada).toEqual({
      id: await idOf('ada'),
      handle: 'ada',
      display_name: 'Ada Lovelace',
      bio: 'Analyst of engines',
      avatar_url: 'https://cdn.example.com/u/ada.png',
      created_on: '2023-01-15',
    });
  });

  it('never exposes email, password_hash, is_admin or deleted_at', async () => {
    for (const r of await queryUser()) {
      for (const key of Object.keys(r.profile)) expect(PUBLIC).toContain(key);
    }
  });

  it('omits bio and avatar_url when they are null, rather than sending null', async () => {
    const bob = byHandle(await queryUser()).bob;
    expect(Object.keys(bob).sort()).toEqual(['created_on', 'display_name', 'handle', 'id']);
  });

  it('keeps an empty-string bio: empty is a value, not a null', async () => {
    const dara = byHandle(await queryUser()).dara;
    expect(Object.keys(dara).sort()).toEqual(PUBLIC);
    expect(dara.bio).toBe('');
  });
});

describe('against new data', () => {
  it('does not leak a sensitive column added to the table later', async () => {
    await q('alter table users add column stripe_customer_id text');
    await q("update users set stripe_customer_id = 'cus_' || id");
    for (const r of await q(userSql)) {
      expect(Object.keys(r.profile)).not.toContain('stripe_customer_id');
      for (const key of Object.keys(r.profile)) expect(PUBLIC).toContain(key);
    }
  });

  it('follows a bio being cleared and a user being deleted', async () => {
    await q("update users set bio = null where handle = 'ada'");
    await q("update users set deleted_at = '2024-06-01Z' where handle = 'dara'");
    const rows = await q(userSql);
    expect(rows.map((r) => r.profile.handle)).toEqual(['ada', 'bob']);
    expect(Object.keys(rows[0].profile)).not.toContain('bio');
    expect(rows[0].profile.avatar_url).toBe('https://cdn.example.com/u/ada.png');
  });
});
