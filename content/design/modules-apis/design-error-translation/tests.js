const { createUserStore, EmailTakenError, UserNotFoundError, StoreUnavailableError } = solution;

/** An error shaped like the ones node-postgres throws. */
const pgError = (code, extra = {}) => Object.assign(new Error(`pg error ${code}`), { code, ...extra });

/** A tiny in-memory driver with a unique index on email, and a way to fail the next call. */
const fakeDb = () => {
  const rows = [];
  let nextId = 1;
  let failure = null;
  const maybeFail = () => {
    if (failure) { const f = failure; failure = null; throw f; }
  };
  return {
    rows,
    failNext(error) { failure = error; },
    async insert(table, row) {
      maybeFail();
      if (rows.some((r) => r.email === row.email)) {
        throw pgError('23505', { constraint: 'users_email_key', detail: `Key (email)=(${row.email}) already exists.` });
      }
      const stored = { id: nextId++, ...row };
      rows.push(stored);
      return { ...stored };
    },
    async findOne(table, where) {
      maybeFail();
      const r = rows.find((x) => x.id === where.id);
      return r ? { ...r } : undefined;
    },
    async update(table, where, patch) {
      maybeFail();
      const r = rows.find((x) => x.id === where.id);
      if (!r) return [];
      Object.assign(r, patch);
      return [{ ...r }];
    },
  };
};

const rejection = async (promise) => {
  try { await promise; } catch (e) { return e; }
  throw new Error('expected the call to reject, but it resolved');
};

describe('expected outcomes', () => {
  it('creates and reads users', async () => {
    const store = createUserStore(fakeDb());
    const ada = await store.create({ email: 'ada@example.com', name: 'Ada' });
    expect(ada).toEqual({ id: 1, email: 'ada@example.com', name: 'Ada' });
    expect(await store.findById(1)).toEqual(ada);
    expect(await store.getById(1)).toEqual(ada);
  });

  it('findById answers "no such user" with null — absence is not an error', async () => {
    const store = createUserStore(fakeDb());
    expect(await store.findById(99)).toBeNull();
  });

  it('getById throws UserNotFoundError carrying the id', async () => {
    const e = await rejection(createUserStore(fakeDb()).getById(99));
    expect(e).toBeInstanceOf(UserNotFoundError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('UserNotFoundError');
    expect(e.id).toBe(99);
  });

  it('rename returns the updated user, or throws UserNotFoundError', async () => {
    const store = createUserStore(fakeDb());
    await store.create({ email: 'ada@example.com', name: 'Ada' });
    expect(await store.rename(1, 'Ada L.')).toEqual({ id: 1, email: 'ada@example.com', name: 'Ada L.' });
    const e = await rejection(store.rename(7, 'x'));
    expect(e).toBeInstanceOf(UserNotFoundError);
    expect(e.id).toBe(7);
  });
});

describe('translating driver errors callers can act on', () => {
  it('turns the email unique violation into EmailTakenError, keeping the cause', async () => {
    const db = fakeDb();
    const store = createUserStore(db);
    await store.create({ email: 'ada@example.com', name: 'Ada' });
    const e = await rejection(store.create({ email: 'ada@example.com', name: 'Imposter' }));
    expect(e).toBeInstanceOf(EmailTakenError);
    expect(e.name).toBe('EmailTakenError');
    expect(e.email).toBe('ada@example.com');
    expect(e.cause.code).toBe('23505');
    expect(e.message).toBe('That email address is already registered');
  });

  it('does not call a different unique violation "email taken"', async () => {
    const db = fakeDb();
    const other = pgError('23505', { constraint: 'users_username_key' });
    db.failNext(other);
    const e = await rejection(createUserStore(db).create({ email: 'x@example.com', name: 'X' }));
    expect(e).not.toBeInstanceOf(EmailTakenError);
    expect(e).toBe(other);
  });

  for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '08006', '08001']) {
    it(`turns ${code} into a retryable StoreUnavailableError`, async () => {
      const db = fakeDb();
      const original = pgError(code);
      db.failNext(original);
      const e = await rejection(createUserStore(db).create({ email: 'x@example.com', name: 'X' }));
      expect(e).toBeInstanceOf(StoreUnavailableError);
      expect(e.name).toBe('StoreUnavailableError');
      expect(e.retryable).toBe(true);
      expect(e.cause).toBe(original);
    });
  }

  it('translates outages on every method, not just create', async () => {
    const db = fakeDb();
    const store = createUserStore(db);
    await store.create({ email: 'ada@example.com', name: 'Ada' });
    db.failNext(pgError('ECONNRESET'));
    expect(await rejection(store.getById(1))).toBeInstanceOf(StoreUnavailableError);
    db.failNext(pgError('ECONNRESET'));
    expect(await rejection(store.rename(1, 'x'))).toBeInstanceOf(StoreUnavailableError);
  });
});

describe('what must not be hidden', () => {
  it('findById does not turn an outage into null ("no such user")', async () => {
    const db = fakeDb();
    db.failNext(pgError('ECONNREFUSED'));
    const e = await rejection(createUserStore(db).findById(1));
    expect(e).toBeInstanceOf(StoreUnavailableError);
  });

  it('getById during an outage is unavailable, not "not found"', async () => {
    const db = fakeDb();
    db.failNext(pgError('57P01'));
    const e = await rejection(createUserStore(db).getById(1));
    expect(e).not.toBeInstanceOf(UserNotFoundError);
    expect(e).toBeInstanceOf(StoreUnavailableError);
  });

  it('lets bugs through unchanged: the very same error object', async () => {
    const db = fakeDb();
    const typo = pgError('42601'); // syntax error: our bug, not an outage
    db.failNext(typo);
    expect(await rejection(createUserStore(db).create({ email: 'a@b.c', name: 'A' }))).toBe(typo);
    const bug = new TypeError('Cannot read properties of undefined');
    db.failNext(bug);
    expect(await rejection(createUserStore(db).findById(1))).toBe(bug);
  });

  it('copes with a driver that rejects with something that is not an Error', async () => {
    const db = fakeDb();
    db.failNext('socket hang up');
    expect(await rejection(createUserStore(db).findById(1))).toBe('socket hang up');
  });
});
