const newAuthor = async (email = 'a@x.com') => {
  const rows = await q(
    "insert into authors (email, name) values ($1, 'Ada') returning id",
    [email],
  );
  return num(rows[0].id);
};

describe('the tables exist with the right columns', () => {
  it('creates authors and books', async () => {
    const tables = await q(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(tables.map((r) => r.table_name)).toEqual(['authors', 'books']);
  });

  it('gives authors the expected columns', async () => {
    const cols = await q(
      "select column_name, is_nullable from information_schema.columns where table_name = 'authors' order by column_name",
    );
    expect(cols.map((c) => c.column_name)).toEqual(['email', 'id', 'joined_at', 'name']);
    expect(cols.every((c) => c.is_nullable === 'NO')).toBe(true);
  });

  it('gives books the expected columns', async () => {
    const cols = await q(
      "select column_name from information_schema.columns where table_name = 'books' order by column_name",
    );
    expect(cols.map((c) => c.column_name))
      .toEqual(['author_id', 'id', 'price_cents', 'published_year', 'title']);
  });

  it('makes every books column required', async () => {
    // A CHECK such as "between 1450 and 2100" passes on NULL, so it does not
    // make a column required on its own.
    const cols = await q(
      "select column_name, is_nullable from information_schema.columns where table_name = 'books' order by column_name",
    );
    expect(cols.filter((c) => c.is_nullable !== 'NO').map((c) => c.column_name)).toEqual([]);
  });

  it('makes id the primary key of each table', async () => {
    const rows = await q(
      "select tc.table_name, kcu.column_name from information_schema.table_constraints tc " +
      'join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name ' +
      "where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public' order by tc.table_name",
    );
    expect(rows).toEqual([
      { table_name: 'authors', column_name: 'id' },
      { table_name: 'books', column_name: 'id' },
    ]);
  });
});

describe('happy path', () => {
  it('accepts a valid author and book, auto-assigning ids', async () => {
    const authorId = await newAuthor();
    expect(authorId).toBeGreaterThan(0);

    const book = await q(
      'insert into books (author_id, title, price_cents, published_year) ' +
      "values ($1, 'A Book', 1999, 2024) returning id",
      [authorId],
    );
    expect(num(book[0].id)).toBeGreaterThan(0);
  });

  it('defaults joined_at to today', async () => {
    const authorId = await newAuthor();
    const rows = await q('select (joined_at = current_date) as is_today from authors where id = $1', [authorId]);
    expect(rows[0].is_today).toBe(true);
  });
});

describe('constraints actually fire', () => {
  it('rejects a duplicate email', async () => {
    await newAuthor('dup@x.com');
    await expect(q("insert into authors (email, name) values ('dup@x.com', 'Impostor')"))
      .rejects.toThrow();
  });

  it('rejects a missing email', async () => {
    await expect(q("insert into authors (name) values ('No Email')")).rejects.toThrow();
  });

  it('rejects a missing name', async () => {
    await expect(q("insert into authors (email) values ('b@x.com')")).rejects.toThrow();
  });

  it('rejects a book with no author', async () => {
    await expect(q(
      "insert into books (title, price_cents, published_year) values ('Orphan', 100, 2024)",
    )).rejects.toThrow();
  });

  it('rejects a book pointing at an author that does not exist', async () => {
    await expect(q(
      'insert into books (author_id, title, price_cents, published_year) ' +
      "values (999999, 'Ghost', 100, 2024)",
    )).rejects.toThrow();
  });

  it('rejects a zero price', async () => {
    const authorId = await newAuthor();
    await expect(q(
      "insert into books (author_id, title, price_cents, published_year) values ($1, 'Free', 0, 2024)",
      [authorId],
    )).rejects.toThrow();
  });

  it('rejects a negative price', async () => {
    const authorId = await newAuthor();
    await expect(q(
      "insert into books (author_id, title, price_cents, published_year) values ($1, 'Owed', -500, 2024)",
      [authorId],
    )).rejects.toThrow();
  });

  it('rejects a publication year before 1450', async () => {
    const authorId = await newAuthor();
    await expect(q(
      "insert into books (author_id, title, price_cents, published_year) values ($1, 'Ancient', 100, 1449)",
      [authorId],
    )).rejects.toThrow();
  });

  it('rejects a publication year after 2100', async () => {
    const authorId = await newAuthor();
    await expect(q(
      "insert into books (author_id, title, price_cents, published_year) values ($1, 'Future', 100, 2101)",
      [authorId],
    )).rejects.toThrow();
  });

  it('accepts the boundary years', async () => {
    const authorId = await newAuthor();
    for (const year of [1450, 2100]) {
      const rows = await q(
        'insert into books (author_id, title, price_cents, published_year) ' +
        "values ($1, 'Edge', 100, $2) returning published_year",
        [authorId, year],
      );
      expect(num(rows[0].published_year)).toBe(year);
    }
  });
});

describe('cascade', () => {
  it('deletes the books of a deleted author', async () => {
    const authorId = await newAuthor('cascade@x.com');
    await q(
      'insert into books (author_id, title, price_cents, published_year) values ' +
      "($1, 'One', 100, 2020), ($1, 'Two', 200, 2021)",
      [authorId],
    );
    const before = await q('select count(*)::int as c from books where author_id = $1', [authorId]);
    expect(num(before[0].c)).toBe(2);

    await q('delete from authors where id = $1', [authorId]);

    const after = await q('select count(*)::int as c from books where author_id = $1', [authorId]);
    expect(num(after[0].c)).toBe(0);
  });
});
