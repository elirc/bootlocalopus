// node-db: one shared database; every test starts from a reset.
async function reset() {
  await db.exec(`
    truncate memberships, users, teams restart identity cascade;
    insert into teams (slug, name) values ('platform', 'Platform');
    insert into users (email, username, age) values ('ada@example.com', 'ada', 36);
  `);
}
beforeEach(reset);

/** A connection with only `query`. `before(text)` runs before each statement is forwarded. */
function spyConn(before) {
  const conn = {
    async query(text, params) {
      if (before) await before(String(text));
      return db.query(text, params);
    },
  };
  return conn;
}

async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected a rejection, but it resolved');
}

/** Like the driver's errors: a code and a constraint name (and a message you should not parse). */
const pgError = (code, constraint, message = 'some server message') =>
  Object.assign(new Error(message), { code, constraint, severity: 'ERROR' });

describe('translateDbError', () => {
  const table = [
    ['23505', 'users_email_lower_key', 'ConflictError', 'field', 'email'],
    ['23505', 'users_username_key', 'ConflictError', 'field', 'username'],
    ['23505', 'teams_slug_key', 'ConflictError', 'field', 'slug'],
    ['23505', 'memberships_pkey', 'ConflictError', 'field', 'membership'],
    ['23503', 'memberships_team_id_fkey', 'NotFoundError', 'entity', 'team'],
    ['23503', 'memberships_user_id_fkey', 'NotFoundError', 'entity', 'user'],
    ['23514', 'users_age_check', 'ValidationError', 'field', 'age'],
    ['23514', 'memberships_role_check', 'ValidationError', 'field', 'role'],
  ];
  for (const [code, constraint, cls, prop, value] of table) {
    it(`maps ${code} on ${constraint} to ${cls} (${prop} ${value}), keeping the original as .cause`, () => {
      const original = pgError(code, constraint);
      const mapped = solution.translateDbError(original);
      expect(mapped).toBeInstanceOf(solution[cls]);
      expect(mapped[prop]).toBe(value);
      expect(mapped.cause).toBe(original);
    });
  }

  it('decides by the constraint name, never the message text', () => {
    const tricky = pgError('23505', 'users_username_key', 'duplicate key value violates unique constraint "users_email_lower_key"');
    expect(solution.translateDbError(tricky).field).toBe('username');
  });

  it('returns anything it does not know unchanged: other codes, other constraints, plain errors', () => {
    for (const err of [
      pgError('23505', 'some_other_key'),
      pgError('23503', 'users_username_key'),
      pgError('40001', undefined),
      pgError('23505', 'constructor'),
      new TypeError('not a database error'),
    ]) {
      expect(solution.translateDbError(err)).toBe(err);
    }
  });
});

describe('registerUser', () => {
  it('resolves to the new id', async () => {
    const id = await solution.registerUser(spyConn(), { email: 'bob@example.com', username: 'bob', age: 30 });
    const r = await q('select id from users where username = $1', ['bob']);
    expect(id).toBe(r[0].id);
  });

  it('turns duplicates into ConflictError with the field, case-insensitively for email', async () => {
    const e1 = await rejectionOf(() => solution.registerUser(spyConn(), { email: 'ADA@example.com', username: 'ada2', age: 30 }));
    expect(e1).toBeInstanceOf(solution.ConflictError);
    expect(e1.field).toBe('email');
    const e2 = await rejectionOf(() => solution.registerUser(spyConn(), { email: 'new@example.com', username: 'ada', age: 30 }));
    expect(e2).toBeInstanceOf(solution.ConflictError);
    expect(e2.field).toBe('username');
    expect(e2.cause.code).toBe('23505');
  });

  it('reports a sign-up that lost a race as a conflict, not a crash', async () => {
    // Another request registers the same email after any check you make,
    // just before your INSERT: only the unique index can catch it.
    let raced = false;
    const conn = spyConn(async (text) => {
      if (!raced && /^\s*insert\s+into\s+users\b/i.test(text)) {
        raced = true;
        await db.query("insert into users (email, username, age) values ('race@example.com', 'winner', 40)");
      }
    });
    const err = await rejectionOf(() => solution.registerUser(conn, { email: 'Race@example.com', username: 'loser', age: 30 }));
    assert(err instanceof solution.ConflictError, `expected ConflictError, got ${err && err.name}: ${err && err.message}`);
    expect(err.field).toBe('email');
    expect(err.cause.code).toBe('23505');
  });

  it('turns a failed age check into ValidationError(\'age\')', async () => {
    const err = await rejectionOf(() => solution.registerUser(spyConn(), { email: 'kid@example.com', username: 'kid', age: 9 }));
    expect(err).toBeInstanceOf(solution.ValidationError);
    expect(err.field).toBe('age');
  });

  it('lets other failures through unchanged', async () => {
    const boom = new Error('connection terminated');
    const conn = spyConn(() => { throw boom; });
    const err = await rejectionOf(() => solution.registerUser(conn, { email: 'x@example.com', username: 'x', age: 20 }));
    expect(err).toBe(boom);
  });
});

describe('addMember', () => {
  it('adds a membership', async () => {
    await solution.addMember(spyConn(), { teamId: 1, userId: 1, role: 'admin' });
    const r = await q('select role from memberships where team_id = 1 and user_id = 1');
    expect(r).toEqual([{ role: 'admin' }]);
  });

  it('maps a missing team or user to NotFoundError, a repeat to ConflictError, a bad role to ValidationError', async () => {
    const noTeam = await rejectionOf(() => solution.addMember(spyConn(), { teamId: 99, userId: 1, role: 'member' }));
    expect(noTeam).toBeInstanceOf(solution.NotFoundError);
    expect(noTeam.entity).toBe('team');
    const noUser = await rejectionOf(() => solution.addMember(spyConn(), { teamId: 1, userId: 99, role: 'member' }));
    expect(noUser).toBeInstanceOf(solution.NotFoundError);
    expect(noUser.entity).toBe('user');
    await solution.addMember(spyConn(), { teamId: 1, userId: 1, role: 'member' });
    const again = await rejectionOf(() => solution.addMember(spyConn(), { teamId: 1, userId: 1, role: 'member' }));
    expect(again).toBeInstanceOf(solution.ConflictError);
    expect(again.field).toBe('membership');
    await reset();
    const badRole = await rejectionOf(() => solution.addMember(spyConn(), { teamId: 1, userId: 1, role: 'owner' }));
    expect(badRole).toBeInstanceOf(solution.ValidationError);
    expect(badRole.field).toBe('role');
  });
});
