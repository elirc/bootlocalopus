/** A connection that exposes only `query` and records every call. */
function spyConn() {
  const calls = [];
  const conn = {
    query(text, params) {
      calls.push({ text: String(text), params: Array.isArray(params) ? [...params] : [] });
      return db.query(text, params);
    },
  };
  return { conn, calls };
}

const search = (query, ownerId = 1) => solution.searchNotes(spyConn().conn, ownerId, query);
const ids = (rows) => rows.map((r) => r.id);

async function noteCount() {
  const rows = await q('select count(*)::int as c from notes');
  return rows[0].c;
}

/** Runs a search that must be refused, and returns the error and the recorded calls. */
async function refused(query) {
  const { conn, calls } = spyConn();
  let error = null;
  try {
    await solution.searchNotes(conn, 1, query);
  } catch (e) {
    error = e;
  }
  assert(error !== null, `expected ${JSON.stringify(query)} to be rejected with a BadRequestError, but it resolved`);
  return { error, calls };
}

async function expectBadRequest(query, field) {
  const { error, calls } = await refused(query);
  expect(error).toBeInstanceOf(solution.BadRequestError);
  expect(error.status).toBe(400);
  expect(error.field).toBe(field);
  assert(calls.length === 0, `rejected input must not reach the database, but ${calls.length} query ran: ${calls[0] && calls[0].text}`);
}

describe('search results', () => {
  it('returns { id, title } rows for the owner, newest first by default', async () => {
    expect(await search({})).toEqual([
      { id: 6, title: 'Annual review prep' },
      { id: 5, title: 'Quarterly plan' },
      { id: 4, title: 'Snake_case vs camelCase' },
      { id: 3, title: 'Discount: 20% off annual plans' },
      { id: 2, title: 'Call O\'Brien about the lease' },
      { id: 1, title: 'Groceries' },
    ]);
  });

  it('only ever returns the owner\'s notes', async () => {
    expect(ids(await search({}, 2))).toEqual([8, 7]);
    expect(ids(await search({ q: 'plan' }, 2))).toEqual([8]);
  });

  it('matches q as a case-insensitive substring of the title', async () => {
    expect(ids(await search({ q: 'plan' }))).toEqual([5, 3]);
    expect(ids(await search({ q: 'PLAN' }))).toEqual([5, 3]);
  });

  it('finds a title with an apostrophe (O\'Brien)', async () => {
    expect(ids(await search({ q: 'O\'Brien' }))).toEqual([2]);
  });

  it('treats % and _ as literal characters, not wildcards', async () => {
    expect(ids(await search({ q: '%' }))).toEqual([3]);
    expect(ids(await search({ q: '_' }))).toEqual([4]);
    expect(ids(await search({ q: '20%' }))).toEqual([3]);
  });

  it('matches everything when q is absent or empty', async () => {
    expect(ids(await search({ q: '' }))).toEqual([6, 5, 4, 3, 2, 1]);
    expect(ids(await search({ q: undefined }))).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it('sorts by title in either direction', async () => {
    expect(ids(await search({ sort: 'title', dir: 'asc' }))).toEqual([6, 2, 3, 1, 5, 4]);
    expect(ids(await search({ sort: 'title' }))).toEqual([4, 5, 1, 3, 2, 6]);
  });

  it('breaks created_at ties by id in the same direction', async () => {
    // Notes 4 and 5 share a created_at.
    expect(ids(await search({ sort: 'created_at', dir: 'asc' }))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ids(await search({ sort: 'created_at', dir: 'desc' }))).toEqual([6, 5, 4, 3, 2, 1]);
  });
});

describe('the injection corpus', () => {
  const corpus = [
    '\' or 1=1--',
    '\' or \'1\'=\'1',
    'x\'); drop table notes;--',
    '\'; delete from notes where \'1\'=\'1',
    '\' union select id, title from notes where owner_id = 2 --',
    'plan\' and owner_id = 2 or \'\'=\'',
  ];

  for (const payload of corpus) {
    it(`q = ${JSON.stringify(payload)} is just a string that matches nothing`, async () => {
      const rows = await search({ q: payload });
      expect(rows).toEqual([]);
      expect(await noteCount()).toBe(8);
    });
  }

  it('leaves every note in place after the whole corpus', async () => {
    for (const payload of corpus) {
      try { await search({ q: payload }); } catch { /* judged above */ }
    }
    const rows = await q('select id, owner_id, title from notes order by id');
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows[1].title).toBe('Call O\'Brien about the lease');
  });
});

describe('sort and dir come from an allowlist', () => {
  it('rejects sort = "name;delete from notes" with a 400, and deletes nothing', async () => {
    await expectBadRequest({ sort: 'name;delete from notes' }, 'sort');
    expect(await noteCount()).toBe(8);
  });

  it('rejects SQL fragments and unlisted columns in sort', async () => {
    for (const sort of ['title desc', 'id', '(select 1)', 'title; drop table notes', '', 'TITLE']) {
      await expectBadRequest({ sort }, 'sort');
    }
  });

  it('rejects names that exist on every object (constructor, __proto__, toString)', async () => {
    for (const sort of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      await expectBadRequest({ sort }, 'sort');
    }
  });

  it('rejects a repeated parameter (an array) in sort', async () => {
    await expectBadRequest({ sort: ['title'] }, 'sort');
  });

  it('rejects anything but asc/desc in dir', async () => {
    for (const dir of ['asc; drop table notes', 'sideways', 'asc nulls first', 'DESC', 'constructor', ['asc']]) {
      await expectBadRequest({ dir }, 'dir');
    }
    expect(await noteCount()).toBe(8);
  });

  it('rejects a q that is not a string', async () => {
    await expectBadRequest({ q: ['plan', 'x'] }, 'q');
  });
});

describe('what reaches the database', () => {
  it('makes exactly one query through conn', async () => {
    const { conn, calls } = spyConn();
    await solution.searchNotes(conn, 1, { q: 'plan', sort: 'title', dir: 'asc' });
    expect(calls).toHaveLength(1);
  });

  it('sends the search string as a parameter, never as SQL text', async () => {
    for (const qText of ['\' or 1=1--', 'O\'Brien', 'Quarterly']) {
      const { conn, calls } = spyConn();
      await solution.searchNotes(conn, 1, { q: qText });
      assert(calls.length === 1, `expected one query, saw ${calls.length}`);
      const [{ text, params }] = calls;
      assert(!text.includes(qText), `the SQL text contains the user's input ${JSON.stringify(qText)}:\n${text}`);
      assert(
        params.some((p) => typeof p === 'string' && p.includes(qText)),
        `the search string is not among the parameters: ${JSON.stringify(params)}`,
      );
    }
  });

  it('sends the owner id as a parameter too', async () => {
    const { conn, calls } = spyConn();
    await solution.searchNotes(conn, 2, {});
    const [{ text, params }] = calls;
    assert(!/owner_id\s*=\s*\d/.test(text), `the owner id is pasted into the SQL:\n${text}`);
    expect(params.some((p) => p === 2 || p === '2')).toBe(true);
  });
});
