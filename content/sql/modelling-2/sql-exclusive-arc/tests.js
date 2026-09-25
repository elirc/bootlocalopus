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

const newPost = async (title) =>
  num((await q('insert into posts (title) values ($1) returning id', [title]))[0].id);
const newPhoto = async (caption) =>
  num((await q('insert into photos (caption) values ($1) returning id', [caption]))[0].id);
const commentOn = async (col, id, body = 'nice') =>
  num((await q(`insert into comments (body, ${col}) values ($1, $2) returning id`, [body, id]))[0].id);
const countWhere = async (sql, params) => num((await q(`select count(*)::int as n from ${sql}`, params))[0].n);

describe('the comments table', () => {
  it('has body, post_id and photo_id, with only the parents nullable', async () => {
    const cols = await q(
      "select column_name, is_nullable from information_schema.columns " +
      "where table_name = 'comments' order by column_name",
    );
    expect(cols.map((c) => c.column_name)).toEqual(['body', 'id', 'photo_id', 'post_id']);
    const nullable = cols.filter((c) => c.is_nullable === 'YES').map((c) => c.column_name);
    expect(nullable).toEqual(['photo_id', 'post_id']);
  });

  it('accepts a comment on a post and a comment on a photo', async () => {
    await commentOn('post_id', await newPost('P'));
    await commentOn('photo_id', await newPhoto('F'));
  });
});

describe('exactly one parent', () => {
  it('rejects a comment with no parent', async () => {
    const err = await attempt("insert into comments (body) values ('orphan')");
    expect(err && err.code).toBe('23514');
  });

  it('rejects a comment with both parents', async () => {
    const p = await newPost('P');
    const f = await newPhoto('F');
    const err = await attempt(
      "insert into comments (body, post_id, photo_id) values ('greedy', $1, $2)", [p, f],
    );
    expect(err && err.code).toBe('23514');
  });

  it('rejects an update that adds a second parent', async () => {
    const f = await newPhoto('F');
    const id = await commentOn('post_id', await newPost('P'));
    const err = await attempt('update comments set photo_id = $1 where id = $2', [f, id]);
    expect(err && err.code).toBe('23514');
  });

  it('rejects a post that does not exist (a real foreign key)', async () => {
    const err = await attempt("insert into comments (body, post_id) values ('ghost', 999999)");
    expect(err && err.code).toBe('23503');
  });

  it('rejects a photo that does not exist (a real foreign key)', async () => {
    const err = await attempt("insert into comments (body, photo_id) values ('ghost', 999999)");
    expect(err && err.code).toBe('23503');
  });
});

describe('delete policies', () => {
  it('deleting a post deletes only its comments', async () => {
    const p = await newPost('P');
    const f = await newPhoto('F');
    await commentOn('post_id', p);
    await commentOn('post_id', p);
    await commentOn('photo_id', f);
    await q('delete from posts where id = $1', [p]);
    expect(await countWhere('comments where post_id = $1', [p])).toBe(0);
    expect(await countWhere('comments where photo_id = $1', [f])).toBe(1);
  });

  it('deleting a photo deletes its comments', async () => {
    const f = await newPhoto('F');
    await commentOn('photo_id', f);
    await q('delete from photos where id = $1', [f]);
    expect(await countWhere('comments where photo_id = $1', [f])).toBe(0);
  });
});

describe('indexes', () => {
  it('indexes both foreign keys', async () => {
    const rows = await q(
      "select a.attname from pg_index i " +
      "join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0] " +
      "where i.indrelid = 'comments'::regclass",
    );
    const leading = rows.map((r) => r.attname);
    expect(leading).toContain('post_id');
    expect(leading).toContain('photo_id');
  });
});

describe('comment_feed', () => {
  it('reconstructs the target of every comment', async () => {
    const p = await newPost('Launch day');
    const f = await newPhoto('Cake');
    const c1 = await commentOn('post_id', p, 'congrats');
    const c2 = await commentOn('photo_id', f, 'yum');
    const rows = await q(
      'select id, body, target_type, target_id, target_label from comment_feed where id in ($1, $2) order by id',
      [c1, c2],
    );
    expect(rows.map((r) => ({ ...r, id: num(r.id), target_id: num(r.target_id) }))).toEqual([
      { id: c1, body: 'congrats', target_type: 'post', target_id: p, target_label: 'Launch day' },
      { id: c2, body: 'yum', target_type: 'photo', target_id: f, target_label: 'Cake' },
    ]);
  });

  it('has one row per comment and nothing else', async () => {
    const p = await newPost('P');
    const f = await newPhoto('F');
    await commentOn('post_id', p);
    await commentOn('photo_id', f);
    await commentOn('photo_id', f);
    expect(await countWhere('comment_feed')).toBe(await countWhere('comments'));
    expect(await countWhere('comment_feed')).toBe(3);
  });

  it('has exactly the documented columns', async () => {
    const cols = await q(
      "select column_name from information_schema.columns where table_name = 'comment_feed' order by ordinal_position",
    );
    expect(cols.map((c) => c.column_name).sort())
      .toEqual(['body', 'id', 'target_id', 'target_label', 'target_type']);
  });
});
