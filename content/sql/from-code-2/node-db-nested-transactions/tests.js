// node-db: one shared database; every test starts from a reset.
async function inTransaction() {
  try {
    await db.query('savepoint __grader_probe');
  } catch (e) {
    return /aborted/i.test(String(e && e.message));
  }
  await db.query('release savepoint __grader_probe');
  return true;
}

async function reset() {
  if (await inTransaction()) await db.query('rollback');
  await db.exec(`
    truncate memberships, teams, audit, users restart identity cascade;
    insert into users (email) values ('taken@example.com');
  `);
}
beforeEach(reset);
afterEach(async () => { if (await inTransaction()) await db.query('rollback'); });

function spyConn() {
  const calls = [];
  const conn = {
    async query(text, params) {
      calls.push(String(text));
      return db.query(text, params);
    },
  };
  return { conn, calls };
}

const emails = async () => (await q('select email from users order by id')).map((r) => r.email);
const audits = async () => (await q('select subject from audit order by id')).map((r) => r.subject);
const addUser = (c, email) => c.query('insert into users (email) values ($1)', [email]);

async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected a rejection, but it resolved');
}
async function closed() {
  assert(!(await inTransaction()), 'the connection was left inside a transaction');
}

describe('withTransaction, outermost', () => {
  it('commits and resolves to work\'s result', async () => {
    const { conn } = spyConn();
    expect(await solution.withTransaction(conn, async (c) => { await addUser(c, 'a@x'); return 'done'; })).toBe('done');
    expect(await emails()).toEqual(['taken@example.com', 'a@x']);
    await closed();
  });

  it('rolls back and rethrows the same error', async () => {
    const boom = new Error('boom');
    const err = await rejectionOf(() => solution.withTransaction(spyConn().conn, async (c) => { await addUser(c, 'a@x'); throw boom; }));
    expect(err).toBe(boom);
    expect(await emails()).toEqual(['taken@example.com']);
    await closed();
  });

  it('is outermost again after a failure on the same connection', async () => {
    const { conn, calls } = spyConn();
    await rejectionOf(() => solution.withTransaction(conn, async () => { throw new Error('first'); }));
    const before = calls.length;
    await solution.withTransaction(conn, async (c) => { await addUser(c, 'second@x'); });
    expect(calls[before]).toMatch(/^\s*(begin|start\s+transaction)\b/i);
    expect(await emails()).toEqual(['taken@example.com', 'second@x']);
    await closed();
  });
});

describe('withTransaction, nested', () => {
  it('commits inner writes together with the outer transaction', async () => {
    const { conn } = spyConn();
    await solution.withTransaction(conn, async (c) => {
      await addUser(c, 'outer@x');
      await solution.withTransaction(c, async (c2) => { await addUser(c2, 'inner@x'); });
    });
    expect(await emails()).toEqual(['taken@example.com', 'outer@x', 'inner@x']);
    await closed();
  });

  it('a caught inner failure undoes only the inner writes, and the outer goes on', async () => {
    const { conn } = spyConn();
    const result = await solution.withTransaction(conn, async (c) => {
      await addUser(c, 'before@x');
      const err = await rejectionOf(() => solution.withTransaction(c, async (c2) => {
        await addUser(c2, 'doomed@x');
        await addUser(c2, 'taken@example.com'); // 23505
      }));
      await addUser(c, 'after@x'); // must work: the transaction is not aborted
      return err.code;
    });
    expect(result).toBe('23505');
    expect(await emails()).toEqual(['taken@example.com', 'before@x', 'after@x']);
    await closed();
  });

  it('an inner success is still undone when the outer transaction fails later', async () => {
    const boom = new Error('outer failed after the inner call');
    const err = await rejectionOf(() => solution.withTransaction(spyConn().conn, async (c) => {
      await solution.withTransaction(c, async (c2) => { await addUser(c2, 'inner@x'); });
      throw boom;
    }));
    expect(err).toBe(boom);
    expect(await emails()).toEqual(['taken@example.com']);
    await closed();
  });

  it('an uncaught inner failure rolls back everything', async () => {
    const err = await rejectionOf(() => solution.withTransaction(spyConn().conn, async (c) => {
      await addUser(c, 'outer@x');
      await solution.withTransaction(c, async (c2) => { await addUser(c2, 'taken@example.com'); });
    }));
    expect(err.code).toBe('23505');
    expect(await emails()).toEqual(['taken@example.com']);
    await closed();
  });

  it('works three levels deep, and after a failure at one level, again at the same level', async () => {
    const { conn } = spyConn();
    await solution.withTransaction(conn, async (c) => {
      await solution.withTransaction(c, async (c2) => {
        await addUser(c2, 'l2@x');
        await rejectionOf(() => solution.withTransaction(c2, async (c3) => { await addUser(c3, 'l3-bad@x'); throw new Error('no'); }));
        await solution.withTransaction(c2, async (c3) => { await addUser(c3, 'l3-good@x'); });
      });
      await rejectionOf(() => solution.withTransaction(c, async (c2) => { await addUser(c2, 'l2-bad@x'); throw new Error('no'); }));
      await addUser(c, 'l1@x');
    });
    expect(await emails()).toEqual(['taken@example.com', 'l2@x', 'l3-good@x', 'l1@x']);
    await closed();
  });

  it('tracks nesting per connection: another connection\'s call is outermost', async () => {
    const a = spyConn();
    const b = spyConn();
    await solution.withTransaction(a.conn, async () => {
      // (Both spies share one database here, so only b's statements are checked.)
      await solution.withTransaction(b.conn, async () => {});
    });
    expect(b.calls[0]).toMatch(/^\s*(begin|start\s+transaction)\b/i);
    expect(b.calls[b.calls.length - 1]).toMatch(/^\s*(commit|end)\b/i);
    await closed();
  });
});

describe('the services', () => {
  it('createUser on its own is one transaction with its audit row', async () => {
    const id = await solution.createUser(spyConn().conn, 'solo@x');
    expect(typeof id).toBe('number');
    expect(await audits()).toEqual(['solo@x']);
    await closed();
  });

  it('inviteTeam skips existing accounts and keeps everything else', async () => {
    const out = await solution.inviteTeam(spyConn().conn, {
      teamName: 'Platform',
      emails: ['ann@x', 'taken@example.com', 'ben@x', 'ann@x', 'cat@x'],
    });
    expect(out.created).toEqual(['ann@x', 'ben@x', 'cat@x']);
    expect(out.skipped).toEqual(['taken@example.com', 'ann@x']);
    expect(await emails()).toEqual(['taken@example.com', 'ann@x', 'ben@x', 'cat@x']);
    expect(await audits()).toEqual(['ann@x', 'ben@x', 'cat@x']);
    const members = await q('select count(*)::int as n from memberships where team_id = $1', [out.teamId]);
    expect(members[0].n).toBe(3);
    await closed();
  });
});
