// Runs one statement inside a savepoint and returns the error it raised (or
// null), leaving the test's transaction usable afterwards.
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

const newPost = async (title = 'A post') =>
  num((await q('insert into posts (title) values ($1) returning id', [title]))[0].id);
const newTag = async (name) =>
  num((await q('insert into tags (name) values ($1) returning id', [name]))[0].id);
const link = (postId, tagId) =>
  q('insert into post_tags (post_id, tag_id) values ($1, $2)', [postId, tagId]);

describe('the tables', () => {
  it('creates tags and post_tags with the expected columns', async () => {
    const cols = await q(
      "select table_name, column_name, is_nullable from information_schema.columns " +
      "where table_schema = 'public' and table_name in ('tags', 'post_tags') order by table_name, column_name",
    );
    expect(cols.map((c) => `${c.table_name}.${c.column_name}`)).toEqual([
      'post_tags.post_id', 'post_tags.tag_id', 'post_tags.tagged_at', 'tags.id', 'tags.name',
    ]);
    expect(cols.filter((c) => c.is_nullable !== 'NO').map((c) => c.column_name)).toEqual([]);
  });

  it('makes (post_id, tag_id) the primary key of post_tags', async () => {
    const rows = await q(
      "select a.attname from pg_index i " +
      "join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) " +
      "where i.indrelid = 'post_tags'::regclass and i.indisprimary order by a.attname",
    );
    expect(rows.map((r) => r.attname)).toEqual(['post_id', 'tag_id']);
  });
});

describe('links', () => {
  it('lets a post carry several tags and a tag several posts', async () => {
    const p1 = await newPost();
    const p2 = await newPost();
    const sql = await newTag('sql');
    const perf = await newTag('performance');
    await link(p1, sql);
    await link(p1, perf);
    await link(p2, sql);
    const rows = await q('select count(*)::int as n from post_tags where tag_id = $1', [sql]);
    expect(num(rows[0].n)).toBe(2);
  });

  it('defaults tagged_at to now()', async () => {
    const p = await newPost();
    const t = await newTag('now');
    await link(p, t);
    const rows = await q('select tagged_at = now() as is_now from post_tags where post_id = $1', [p]);
    expect(rows[0].is_now).toBe(true);
  });

  it('refuses to tag the same post twice with the same tag', async () => {
    const p = await newPost();
    const t = await newTag('dup');
    await link(p, t);
    const err = await attempt('insert into post_tags (post_id, tag_id) values ($1, $2)', [p, t]);
    expect(err && err.code).toBe('23505');
  });

  it('refuses a tag that does not exist', async () => {
    const p = await newPost();
    const err = await attempt('insert into post_tags (post_id, tag_id) values ($1, 999999)', [p]);
    expect(err && err.code).toBe('23503');
  });

  it('refuses a post that does not exist', async () => {
    const t = await newTag('ghost');
    const err = await attempt('insert into post_tags (post_id, tag_id) values (999999, $1)', [t]);
    expect(err && err.code).toBe('23503');
  });
});

describe('delete policies', () => {
  it('deleting a post deletes its links and keeps the tags', async () => {
    const p = await newPost();
    const t = await newTag('keep-me');
    await link(p, t);
    await q('delete from posts where id = $1', [p]);
    const links = await q('select count(*)::int as n from post_tags where post_id = $1', [p]);
    expect(num(links[0].n)).toBe(0);
    const tags = await q('select count(*)::int as n from tags where id = $1', [t]);
    expect(num(tags[0].n)).toBe(1);
  });

  it('refuses to delete a tag that is still in use', async () => {
    const p = await newPost();
    const t = await newTag('in-use');
    await link(p, t);
    const err = await attempt('delete from tags where id = $1', [t]);
    expect(err && err.code).toBe('23503');
    const links = await q('select count(*)::int as n from post_tags where tag_id = $1', [t]);
    expect(num(links[0].n)).toBe(1);
  });

  it('lets an unused tag be deleted', async () => {
    const t = await newTag('unused');
    await q('delete from tags where id = $1', [t]);
    const rows = await q('select count(*)::int as n from tags where id = $1', [t]);
    expect(num(rows[0].n)).toBe(0);
  });
});

describe('indexes', () => {
  const leading = async () => (await q(
    "select a.attname from pg_index i " +
    "join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0] " +
    "where i.indrelid = 'post_tags'::regclass",
  )).map((r) => r.attname);

  it('has an index leading with post_id (tags of a post)', async () => {
    expect(await leading()).toContain('post_id');
  });

  it('has an index leading with tag_id (posts with a tag)', async () => {
    expect(await leading()).toContain('tag_id');
  });
});
