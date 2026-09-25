// node-db: one shared database; every test starts from a reset.
async function reset() {
  await db.exec(`
    truncate users restart identity;
    insert into users (email, display_name, bio, credit_cents, created_at, updated_at) values
      ('ada@example.com', 'Ada', 'Writes compilers.', 500, '2024-01-01T09:00:00Z', '2024-01-01T09:00:00Z'),
      ('bob@example.com', 'Bob', null, 0, '2024-01-02T09:00:00Z', '2024-01-02T09:00:00Z'),
      ('cy@example.com', 'Cy', 'Plays the oboe.', 1200, '2024-01-03T09:00:00Z', '2024-01-03T09:00:00Z');
  `);
}
beforeEach(reset);

function spyConn() {
  const calls = [];
  const conn = {
    async query(text, params) {
      calls.push({ text: String(text), params: Array.isArray(params) ? [...params] : [] });
      return db.query(text, params);
    },
  };
  return { conn, calls, repo: solution.createUserRepository(conn) };
}

async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected a rejection, but it resolved');
}

async function rawUser(id) {
  const r = await q('select * from users where id = $1', [id]);
  return r[0];
}

const ADA = {
  id: 1,
  email: 'ada@example.com',
  displayName: 'Ada',
  bio: 'Writes compilers.',
  creditCents: 500,
  createdAt: new Date('2024-01-01T09:00:00Z'),
  updatedAt: new Date('2024-01-01T09:00:00Z'),
};

describe('reading', () => {
  it('maps a row to exactly { id, email, displayName, bio, creditCents, createdAt, updatedAt }', async () => {
    const { repo } = spyConn();
    const ada = await repo.findById(1);
    expect(ada).toStrictEqual(ADA);
    expect(ada.createdAt).toBeInstanceOf(Date);
    expect((await repo.findById(2)).bio).toBeNull();
  });

  it('resolves to null (not undefined) for an unknown id', async () => {
    const { repo } = spyConn();
    expect(await repo.findById(999)).toBeNull();
  });

  it('rejects an id that is not a positive safe integer with a RangeError, before any query', async () => {
    for (const id of ['1', 0, -1, 1.5, NaN, null]) {
      const { repo, calls } = spyConn();
      const err = await rejectionOf(() => repo.findById(id));
      assert(err instanceof RangeError, `findById(${JSON.stringify(id)}): expected a RangeError, got ${err && err.name}`);
      expect(calls).toEqual([]);
    }
  });
});

describe('create', () => {
  it('inserts and returns the mapped user, with defaults from the database', async () => {
    const { repo } = spyConn();
    const u = await repo.create({ email: 'dee@example.com', displayName: 'Dee' });
    expect(u).toMatchObject({ id: 4, email: 'dee@example.com', displayName: 'Dee', bio: null, creditCents: 0 });
    expect(Object.keys(u).sort()).toEqual(['bio', 'createdAt', 'creditCents', 'displayName', 'email', 'id', 'updatedAt']);
    expect(u.createdAt).toBeInstanceOf(Date);
  });
});

describe('update (PATCH semantics)', () => {
  it('changes only the fields present in the patch', async () => {
    const { repo } = spyConn();
    const u = await repo.update(1, { displayName: 'Ada L.' });
    expect(u).toMatchObject({ id: 1, email: 'ada@example.com', displayName: 'Ada L.', bio: 'Writes compilers.', creditCents: 500 });
    const row = await rawUser(1);
    expect(row.bio).toBe('Writes compilers.');
    expect(row.email).toBe('ada@example.com');
  });

  it('treats undefined as absent and null as "clear it" (bio only)', async () => {
    const { repo } = spyConn();
    const u = await repo.update(3, { bio: null, displayName: undefined });
    expect(u).toMatchObject({ displayName: 'Cy', bio: null });
    expect((await rawUser(3)).display_name).toBe('Cy');
  });

  it('bumps updated_at and never touches created_at', async () => {
    const { repo } = spyConn();
    const u = await repo.update(1, { bio: 'Also writes poetry.' });
    assert(u.updatedAt > ADA.updatedAt, 'updatedAt was not bumped');
    expect(u.createdAt).toEqual(ADA.createdAt);
  });

  it('sets several fields in one UPDATE with every value as a parameter', async () => {
    const { repo, calls } = spyConn();
    await repo.update(2, { email: 'robert@example.com', displayName: 'Robert', bio: 'Likes SQL.' });
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/^\s*update\b/i);
    for (const v of ['robert@example.com', 'Robert', 'Likes SQL.']) {
      assert(!calls[0].text.includes(v), `${v} is in the SQL text`);
      expect(calls[0].params).toContain(v);
    }
    expect(await repo.findById(2)).toMatchObject({ email: 'robert@example.com', displayName: 'Robert', bio: 'Likes SQL.' });
  });

  it('works for every combination of fields (placeholders numbered right)', async () => {
    const { repo } = spyConn();
    await repo.update(1, { bio: 'B1' });
    await repo.update(1, { email: 'e2@example.com', bio: 'B2' });
    await repo.update(1, { displayName: 'D3', bio: null });
    expect(await repo.findById(1)).toMatchObject({ email: 'e2@example.com', displayName: 'D3', bio: null, creditCents: 500 });
    expect(await repo.findById(2)).toMatchObject({ email: 'bob@example.com', displayName: 'Bob' });
  });

  it('with nothing to change, returns the current user without an UPDATE', async () => {
    const { repo, calls } = spyConn();
    expect(await repo.update(1, {})).toStrictEqual(ADA);
    expect(await repo.update(1, { bio: undefined })).toStrictEqual(ADA);
    expect(calls.some((c) => /^\s*update\b/i.test(c.text))).toBe(false);
  });

  it('resolves to null for an unknown id', async () => {
    const { repo } = spyConn();
    expect(await repo.update(999, { displayName: 'Nobody' })).toBeNull();
  });

  it('rejects fields that may not be patched, and bad values, before any query', async () => {
    const bad = [
      { creditCents: 999999 }, { id: 7 }, { createdAt: new Date() }, { display_name: 'x' },
      { 'email = \'x\', credit_cents': 1 }, { constructor: 'x' }, { toString: 'x' },
      { email: null }, { displayName: null }, { displayName: 42 }, null, 'bio=x',
    ];
    for (const patch of bad) {
      const { repo, calls } = spyConn();
      const err = await rejectionOf(() => repo.update(1, patch));
      assert(err instanceof RangeError, `${JSON.stringify(patch)}: expected a RangeError, got ${err && err.name}`);
      expect(calls).toEqual([]);
    }
    expect(await rawUser(1)).toMatchObject({ credit_cents: 500, email: 'ada@example.com' });
  });
});

describe('remove', () => {
  it('resolves to true when a user was deleted and false when there was none', async () => {
    const { repo } = spyConn();
    expect(await repo.remove(2)).toBe(true);
    expect(await repo.remove(2)).toBe(false);
    expect(await repo.findById(2)).toBeNull();
  });
});
