// node-db: the lesson only reads, so the fixture is never changed.
function spyConn() {
  const calls = [];
  const conn = {
    async query(text, params) {
      calls.push({ text: String(text), params: Array.isArray(params) ? params : [] });
      return db.query(text, params);
    },
  };
  return { conn, calls };
}

let ALL = null;
async function allTickets() {
  if (!ALL) ALL = await q('select id, title, status, assignee_id, priority, tags, created_at from tickets');
  return ALL;
}

/** The grader's own reading of the filters, in JavaScript. */
function matches(t, f) {
  if (f.status !== undefined && ![].concat(f.status).includes(t.status)) return false;
  if (f.assigneeId !== undefined && t.assignee_id !== f.assigneeId) return false;
  if (f.minPriority !== undefined && t.priority < f.minPriority) return false;
  if (f.tags !== undefined && !f.tags.every((tag) => t.tags.includes(tag))) return false;
  if (f.createdFrom !== undefined && t.created_at < f.createdFrom) return false;
  if (f.createdTo !== undefined && !(t.created_at < f.createdTo)) return false;
  if (f.search !== undefined && !t.title.toLowerCase().includes(f.search.toLowerCase())) return false;
  return true;
}
async function expectedIds(f, limit = 50) {
  const rows = (await allTickets()).filter((t) => matches(t, f));
  rows.sort((a, b) => b.created_at - a.created_at || b.id - a.id);
  return rows.slice(0, limit).map((t) => t.id);
}

async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected a rejection, but it resolved');
}

const d = (iso) => new Date(iso);

describe('listTickets', () => {
  it('with no filters: the newest 50, as { id, title, status, assigneeId, priority, tags, createdAt }', async () => {
    const got = await solution.listTickets(spyConn().conn);
    expect(got.map((t) => t.id)).toEqual(await expectedIds({}));
    expect(Object.keys(got[0]).sort()).toEqual(['assigneeId', 'createdAt', 'id', 'priority', 'status', 'tags', 'title']);
    expect(got[0].createdAt).toBeInstanceOf(Date);
    expect(Array.isArray(got[0].tags)).toBe(true);
  });

  const cases = [
    { status: 'open' },
    { status: ['open', 'pending'] },
    { assigneeId: 2 },
    { assigneeId: null },
    { minPriority: 3 },
    { tags: ['urgent'] },
    { tags: ['auth', 'urgent'] },
    { createdFrom: d('2024-04-10T00:00:00Z'), createdTo: d('2024-04-15T00:00:00Z') },
    { search: 'LOG IN' },
    { search: '100%' },
    { search: '_' },
    { status: 'pending', assigneeId: null, search: 'crash' },
    { status: ['closed', 'open'], tags: ['billing'], search: 'refund', createdFrom: d('2024-04-05T00:00:00Z') },
    { assigneeId: 3, status: 'closed', createdTo: d('2024-04-20T00:00:00Z'), minPriority: 2 },
    { minPriority: undefined, status: 'open', search: undefined },
  ];
  cases.forEach((f, i) => {
    it(`filters correctly: case ${i + 1} ${JSON.stringify(f)}`, async () => {
      const got = await solution.listTickets(spyConn().conn, f);
      const want = await expectedIds(f);
      if (!('search' in f && f.search === '_')) assert(want.length > 0, 'sanity: this case should match some tickets');
      expect(got.map((t) => t.id)).toEqual(want);
    });
  });

  it('applies limit after the filters', async () => {
    const got = await solution.listTickets(spyConn().conn, { status: 'open' }, { limit: 3 });
    expect(got.map((t) => t.id)).toEqual(await expectedIds({ status: 'open' }, 3));
  });

  it('runs one query with every value as a parameter', async () => {
    const { conn, calls } = spyConn();
    await solution.listTickets(conn, { search: 'zq-probe', assigneeId: 987654, tags: ['tag-zq'], minPriority: 4 }, { limit: 7 });
    expect(calls).toHaveLength(1);
    for (const v of ['zq-probe', '987654', 'tag-zq']) assert(!calls[0].text.includes(v), `${v} is in the SQL text:\n${calls[0].text}`);
    expect(calls[0].params.some((x) => typeof x === 'string' && x.includes('zq-probe'))).toBe(true);
    expect(calls[0].params).toContain(987654);
  });

  it('treats quotes and SQL in a search as text', async () => {
    const got = await solution.listTickets(spyConn().conn, { search: "' or 1=1 --" });
    expect(got).toEqual([]);
  });

  it('rejects unknown filters and bad values with BadFilterError, naming the field, before any query', async () => {
    const bad = [
      [{ priority: 3 }, 'priority'],
      [{ constructor: 'x' }, 'constructor'],
      [{ status: 'deleted' }, 'status'],
      [{ status: [] }, 'status'],
      [{ status: ['open', 'nope'] }, 'status'],
      [{ assigneeId: '2' }, 'assigneeId'],
      [{ assigneeId: 0 }, 'assigneeId'],
      [{ minPriority: 5 }, 'minPriority'],
      [{ minPriority: 2.5 }, 'minPriority'],
      [{ tags: 'urgent' }, 'tags'],
      [{ tags: [] }, 'tags'],
      [{ createdFrom: '2024-04-01' }, 'createdFrom'],
      [{ createdTo: new Date('nope') }, 'createdTo'],
      [{ search: '' }, 'search'],
    ];
    for (const [f, field] of bad) {
      const { conn, calls } = spyConn();
      const err = await rejectionOf(() => solution.listTickets(conn, f));
      assert(err instanceof solution.BadFilterError, `${JSON.stringify(f)}: expected BadFilterError, got ${err && err.name}`);
      expect(err.field).toBe(field);
      expect(calls).toEqual([]);
    }
    for (const limit of [0, 101, '10', 1.5]) {
      const { conn, calls } = spyConn();
      const err = await rejectionOf(() => solution.listTickets(conn, {}, { limit }));
      assert(err instanceof solution.BadFilterError && err.field === 'limit', `limit ${JSON.stringify(limit)}: expected BadFilterError('limit')`);
      expect(calls).toEqual([]);
    }
  });
});

describe('buildWhere', () => {
  it('returns an empty clause and no params for no filters', () => {
    expect(solution.buildWhere({})).toEqual({ clause: '', params: [] });
    expect(solution.buildWhere({ status: undefined })).toEqual({ clause: '', params: [] });
  });

  it('numbers its placeholders $1..$n to match params, and starts with where', () => {
    const { clause, params } = solution.buildWhere({ status: 'open', assigneeId: null, search: 'x', minPriority: 2 });
    expect(clause).toMatch(/^where\s/i);
    const used = [...clause.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect([...new Set(used)].sort((a, b) => a - b)).toEqual(params.map((_, i) => i + 1));
  });
});
