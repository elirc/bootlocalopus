const shape = (rows) => rows.map((r) => [num(r.id), r.tags, r.tag_line, num(r.comment_count)]);
const ids = async () => (await q('select id from posts where published order by id')).map((r) => num(r.id));

describe('posts with tags and comment counts', () => {
  it('has the expected columns', async () => {
    const rows = await queryUser();
    expect(Object.keys(rows[0]).sort()).toEqual(['comment_count', 'id', 'tag_line', 'tags', 'title']);
  });

  it('lists published posts only, in id order', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => num(r.id))).toEqual(await ids());
    expect(rows.map((r) => r.title)).not.toContain('Draft: indexes');
  });

  it('returns tags as a real array, alphabetical and without duplicates', async () => {
    const rows = await queryUser();
    expect(Array.isArray(rows[0].tags)).toBe(true);
    expect(rows[0].tags).toEqual(['joins', 'postgres', 'sql']);
    expect(rows[0].tag_line).toBe('joins, postgres, sql');
  });

  it('does not multiply the comment count by the tag count', async () => {
    const rows = await queryUser();
    expect(num(rows[0].comment_count)).toBe(4);
  });

  it('gives an untagged post an empty array and an empty string, not nulls', async () => {
    const rows = await queryUser();
    const untagged = rows.find((r) => r.title === 'Untagged musings');
    expect(untagged.tags).toEqual([]);
    expect(untagged.tag_line).toBe('');
    expect(num(untagged.comment_count)).toBe(2);
  });

  it('matches the full result', async () => {
    const [p1, p2, p3, p5] = await ids();
    expect(shape(await queryUser())).toEqual([
      [p1, ['joins', 'postgres', 'sql'], 'joins, postgres, sql', 4],
      [p2, ['money'], 'money', 0],
      [p3, [], '', 2],
      [p5, [], '', 0],
    ]);
  });
});

describe('against new data', () => {
  it('stays correct when a post gains both tags and comments', async () => {
    const [, p2] = await ids();
    await q("insert into post_tags (post_id, tag_id) select $1, id from tags where name in ('sql', 'postgres')", [p2]);
    await q("insert into comments (post_id, body) values ($1, 'a'), ($1, 'b'), ($1, 'c')", [p2]);
    const row = shape(await q(userSql)).find((r) => r[0] === p2);
    expect(row).toEqual([p2, ['money', 'postgres', 'sql'], 'money, postgres, sql', 3]);
  });
});
