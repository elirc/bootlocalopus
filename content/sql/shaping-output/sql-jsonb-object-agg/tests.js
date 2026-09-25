const DEFAULTS = { theme: 'light', digest: 'weekly', page_size: 25, beta_features: true, timezone: 'UTC' };
const byEmail = (rows) => Object.fromEntries(rows.map((r) => [r.email, r]));
const userId = async (email) => num((await q('select id from users where email = $1', [email]))[0].id);

describe('settings per user', () => {
  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['email', 'id', 'overrides', 'settings']);
  });

  it('returns one row per user, including users with no overrides, in id order', async () => {
    const rows = await queryUser();
    const ids = (await q('select id from users order by id')).map((r) => num(r.id));
    expect(rows.map((r) => num(r.id))).toEqual(ids);
  });

  it('merges overrides over the defaults', async () => {
    const ada = byEmail(await queryUser())['ada@example.com'];
    expect(ada.settings).toEqual({ ...DEFAULTS, theme: 'dark', page_size: 50 });
    expect(ada.overrides).toEqual({ theme: 'dark', page_size: 50 });
  });

  it('gives a user with no overrides the defaults and an empty object, not null', async () => {
    const bob = byEmail(await queryUser())['bob@example.com'];
    expect(bob.settings).toEqual(DEFAULTS);
    expect(bob.overrides).toEqual({});
  });

  it('drops overrides for settings that no longer exist', async () => {
    const chen = byEmail(await queryUser())['chen@example.com'];
    expect(Object.keys(chen.settings).sort()).toEqual(Object.keys(DEFAULTS).sort());
    expect(Object.keys(chen.overrides)).toEqual(['digest']);
  });

  it('keeps an explicit JSON null as a value', async () => {
    const chen = byEmail(await queryUser())['chen@example.com'];
    expect('digest' in chen.settings).toBe(true);
    expect(chen.settings.digest).toBeNull();
    expect('digest' in chen.overrides).toBe(true);
    expect(chen.overrides.digest).toBeNull();
  });

  it('keeps JSON types: false stays a boolean, numbers stay numbers', async () => {
    const rows = byEmail(await queryUser());
    expect(rows['dara@example.com'].settings.beta_features).toBe(false);
    expect(rows['dara@example.com'].overrides).toEqual({ beta_features: false });
    expect(rows['ada@example.com'].settings.page_size).toBe(50);
  });
});

describe('against new data', () => {
  it('gives everyone a newly added setting at its default', async () => {
    await q("insert into setting_defaults (key, value) values ('locale', '\"en-GB\"')");
    const rows = await q(userSql);
    expect(rows.every((r) => r.settings.locale === 'en-GB')).toBe(true);
    expect(byEmail(rows)['bob@example.com'].overrides).toEqual({});
  });

  it('falls back to the default when an override is removed', async () => {
    await q("delete from user_settings where user_id = $1 and key = 'theme'", [await userId('ada@example.com')]);
    const ada = byEmail(await q(userSql))['ada@example.com'];
    expect(ada.settings.theme).toBe('light');
    expect(ada.overrides).toEqual({ page_size: 50 });
  });

  it('includes a new user with the defaults', async () => {
    await q("insert into users (email) values ('eve@example.com')");
    const eve = byEmail(await q(userSql))['eve@example.com'];
    expect(eve.settings).toEqual(DEFAULTS);
    expect(eve.overrides).toEqual({});
  });
});
