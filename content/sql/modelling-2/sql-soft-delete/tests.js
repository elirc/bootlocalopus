const attempt = async (sql, params) => {
  await q('savepoint probe');
  try {
    await q(sql, params);
    await q('release savepoint probe');
    return null;
  } catch (e) {
    await q('rollback to savepoint probe');
    return e;
  }
};

const addUser = async (email, name = 'U') =>
  num((await q('insert into users (email, name) values ($1, $2) returning id', [email, name]))[0].id);
const softDelete = (id) => q('update users set deleted_at = now() where id = $1', [id]);

describe('the migration', () => {
  it('keeps the existing rows, all live', async () => {
    const rows = await q('select email, deleted_at from users order by id');
    expect(rows.map((r) => r.email)).toEqual(['ada@example.com', 'bob@example.com', 'chen@example.com']);
    expect(rows.every((r) => r.deleted_at === null)).toBe(true);
  });

  it('adds a nullable timestamptz deleted_at', async () => {
    const cols = await q(
      "select data_type, is_nullable from information_schema.columns where table_name = 'users' and column_name = 'deleted_at'",
    );
    expect(cols).toEqual([{ data_type: 'timestamp with time zone', is_nullable: 'YES' }]);
  });

  it('drops users_email_key', async () => {
    const rows = await q("select conname from pg_constraint where conname = 'users_email_key'");
    expect(rows).toEqual([]);
  });

  it('creates users_live_email_idx as a unique, partial index', async () => {
    const rows = await q(
      "select i.indisunique, i.indpred is not null as partial from pg_index i " +
      "join pg_class c on c.oid = i.indexrelid where c.relname = 'users_live_email_idx'",
    );
    expect(rows).toEqual([{ indisunique: true, partial: true }]);
  });
});

describe('uniqueness among live users', () => {
  it('rejects a second live user with the same email', async () => {
    await addUser('dup@x.com');
    const err = await attempt("insert into users (email, name) values ('dup@x.com', 'Twin')");
    expect(err && err.code).toBe('23505');
  });

  it('rejects the same email in a different case', async () => {
    await addUser('Case@X.com');
    const err = await attempt("insert into users (email, name) values ('case@x.com', 'Twin')");
    expect(err && err.code).toBe('23505');
  });

  it('lets a new user take the email of a deleted one', async () => {
    const old = await addUser('back@x.com', 'Old');
    await softDelete(old);
    const again = await addUser('back@x.com', 'New');
    expect(again).not.toBe(old);
  });

  it('lets several deleted users share an email', async () => {
    for (let i = 0; i < 3; i++) await softDelete(await addUser('churn@x.com'));
    const rows = await q("select count(*)::int as n from users where email = 'churn@x.com'");
    expect(num(rows[0].n)).toBe(3);
  });

  it('refuses to restore a deleted user whose email is now taken', async () => {
    const old = await addUser('taken@x.com', 'Old');
    await softDelete(old);
    await addUser('TAKEN@x.com', 'New');
    const err = await attempt('update users set deleted_at = null where id = $1', [old]);
    expect(err && err.code).toBe('23505');
  });

  it('allows restoring a deleted user whose email is still free', async () => {
    const old = await addUser('free@x.com');
    await softDelete(old);
    await q('update users set deleted_at = null where id = $1', [old]);
    const rows = await q('select deleted_at from users where id = $1', [old]);
    expect(rows[0].deleted_at).toBeNull();
  });
});

describe('live_users', () => {
  it('has the columns id, email, name', async () => {
    const cols = await q(
      "select column_name from information_schema.columns where table_name = 'live_users' order by column_name",
    );
    expect(cols.map((c) => c.column_name)).toEqual(['email', 'id', 'name']);
  });

  it('shows live users and hides deleted ones', async () => {
    const gone = await addUser('gone@x.com', 'Gone');
    const here = await addUser('here@x.com', 'Here');
    await softDelete(gone);
    const rows = await q('select id from live_users where id in ($1, $2)', [gone, here]);
    expect(rows.map((r) => num(r.id))).toEqual([here]);
    const all = await q('select count(*)::int as n from live_users');
    expect(num(all[0].n)).toBe(4);
  });
});
