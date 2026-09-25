// node-db: one shared database; every test starts from an empty schema.
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
  await db.exec('drop table if exists schema_migrations, posts, users, audit cascade;');
}
beforeEach(reset);
afterEach(async () => { if (await inTransaction()) await db.query('rollback'); });

/** A connection with `query(text, params)` and `exec(sql)`; records every call. `before(kind, text)` may throw. */
function spyConn(before) {
  const calls = [];
  const conn = {
    async query(text, params) {
      calls.push({ kind: 'query', text: String(text) });
      if (before) await before('query', String(text));
      return db.query(text, params);
    },
    async exec(sql) {
      calls.push({ kind: 'exec', text: String(sql) });
      if (before) await before('exec', String(sql));
      return db.exec(sql);
    },
  };
  return { conn, calls };
}

const sha256 = async (s) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(s, 'utf8').digest('hex');
};

const M1 = { id: '001_users', sql: 'create table users (id serial primary key, email text not null unique);' };
const M2 = {
  id: '002_posts',
  sql: `create table posts (id serial primary key, user_id integer not null references users(id), title text not null);
create index posts_user_id_idx on posts (user_id);`,
};
const M3 = { id: '003_users_name', sql: "alter table users add column name text not null default '';" };
const BROKEN = {
  id: '003_broken',
  sql: `create table audit (id serial primary key);
alter table users add column nickname text references no_such_table(id);`,
};

async function tableExists(name) {
  const r = await db.query('select to_regclass($1) is not null as ok', [name]);
  return r.rows[0].ok;
}
async function recorded() {
  const r = await db.query('select id, checksum from schema_migrations order by id');
  return r.rows;
}
async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected migrate() to reject, but it resolved');
}
const isBegin = (c) => c.kind === 'query' && /^\s*(begin|start\s+transaction)\b/i.test(c.text);
const isCommit = (c) => c.kind === 'query' && /^\s*(commit|end)\b/i.test(c.text);

describe('a first run', () => {
  it('applies every migration, records each with its sha256, and resolves to the ids', async () => {
    const out = await solution.migrate(spyConn().conn, [M1, M2]);
    expect(out).toEqual(['001_users', '002_posts']);
    expect(await tableExists('posts')).toBe(true);
    expect(await recorded()).toEqual([
      { id: '001_users', checksum: await sha256(M1.sql) },
      { id: '002_posts', checksum: await sha256(M2.sql) },
    ]);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('applies them in id order whatever order they are given in', async () => {
    const out = await solution.migrate(spyConn().conn, [M3, M2, M1]);
    expect(out).toEqual(['001_users', '002_posts', '003_users_name']);
  });

  it('runs each migration in its own transaction', async () => {
    const { conn, calls } = spyConn();
    await solution.migrate(conn, [M1, M2]);
    expect(calls.filter(isBegin)).toHaveLength(2);
    expect(calls.filter(isCommit)).toHaveLength(2);
    const execs = calls.map((c, i) => [c, i]).filter(([c]) => c.kind === 'exec');
    for (const [, i] of execs) {
      const lastBegin = calls.slice(0, i).map(isBegin).lastIndexOf(true);
      const lastCommit = calls.slice(0, i).map(isCommit).lastIndexOf(true);
      assert(lastBegin > lastCommit, 'a migration ran outside a transaction');
    }
  });
});

describe('later runs', () => {
  it('applies nothing when everything is applied', async () => {
    await solution.migrate(spyConn().conn, [M1, M2]);
    const { conn, calls } = spyConn();
    expect(await solution.migrate(conn, [M1, M2])).toEqual([]);
    expect(calls.filter((c) => c.kind === 'exec')).toEqual([]);
  });

  it('applies only the new migration', async () => {
    await solution.migrate(spyConn().conn, [M1, M2]);
    expect(await solution.migrate(spyConn().conn, [M1, M2, M3])).toEqual(['003_users_name']);
    const cols = await db.query("select column_name from information_schema.columns where table_name = 'users' order by column_name");
    expect(cols.rows.map((r) => r.column_name)).toEqual(['email', 'id', 'name']);
  });

  it('refuses to run anything when an applied migration was edited (MigrationChecksumError)', async () => {
    await solution.migrate(spyConn().conn, [M1]);
    const edited = { ...M1, sql: M1.sql.replace('not null unique', 'unique') };
    const { conn, calls } = spyConn();
    const err = await rejectionOf(() => solution.migrate(conn, [edited, M2]));
    expect(err).toBeInstanceOf(solution.MigrationChecksumError);
    expect(err.migrationId).toBe('001_users');
    expect(await tableExists('posts')).toBe(false);
    expect(calls.filter((c) => c.kind === 'exec')).toEqual([]);
  });
});

describe('a failing migration', () => {
  it('leaves none of itself behind, keeps the earlier ones, and stops', async () => {
    const { conn } = spyConn();
    const err = await rejectionOf(() => solution.migrate(conn, [M1, M2, BROKEN, { id: '004_after', sql: 'create table after_broken (id int);' }]));
    expect(err).toBeInstanceOf(solution.MigrationFailedError);
    expect(err.migrationId).toBe('003_broken');
    assert(err.cause && err.cause.code === '42P01', `expected .cause to be the database error (42P01), got ${err.cause && err.cause.code}`);
    expect(await tableExists('audit')).toBe(false);
    expect(await tableExists('after_broken')).toBe(false);
    expect((await recorded()).map((r) => r.id)).toEqual(['001_users', '002_posts']);
    assert(!(await inTransaction()), 'the connection was left inside a transaction');
  });

  it('can be fixed and rerun', async () => {
    await rejectionOf(() => solution.migrate(spyConn().conn, [M1, BROKEN]));
    const fixed = { id: '003_broken', sql: 'create table audit (id serial primary key);' };
    expect(await solution.migrate(spyConn().conn, [M1, fixed])).toEqual(['003_broken']);
    expect(await tableExists('audit')).toBe(true);
  });

  it('does not record a migration whose bookkeeping insert failed', async () => {
    const injected = new Error('injected: connection reset');
    const { conn } = spyConn((kind, text) => {
      if (/insert\s+into\s+schema_migrations/i.test(text)) {
        throw injected;
      }
    });
    const err = await rejectionOf(() => solution.migrate(conn, [M1]));
    expect(err).toBeInstanceOf(solution.MigrationFailedError);
    expect(err.cause).toBe(injected);
    expect(await tableExists('users')).toBe(false);
  });
});

describe('input', () => {
  it('rejects duplicate or missing ids with a RangeError before touching the database', async () => {
    for (const list of [[M1, { ...M1 }], [{ id: '', sql: 'select 1' }], [{ id: '001', sql: 42 }]]) {
      const { conn, calls } = spyConn();
      const err = await rejectionOf(() => solution.migrate(conn, list));
      assert(err instanceof RangeError, `expected a RangeError, got ${err && err.name}`);
      expect(calls).toEqual([]);
    }
  });
});
