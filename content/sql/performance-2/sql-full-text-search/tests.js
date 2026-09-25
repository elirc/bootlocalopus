beforeEach(async () => { await execUser(); });

const search = async (text) => (await q('select id, title, rank from search_articles($1)', [text]))
  .map((r) => ({ id: num(r.id), title: r.title, rank: Number(r.rank) }));
const idsOf = async (text) => (await search(text)).map((r) => r.id);
const sorted = (xs) => [...xs].sort((a, b) => a - b);

function nodesOf(plan) {
  const out = [plan];
  for (const child of plan.Plans || []) out.push(...nodesOf(child));
  return out;
}

describe('the search column', () => {
  it('is a stored generated tsvector column called search', async () => {
    const rows = await q(`select format_type(atttypid, atttypmod) as type, attgenerated as gen
      from pg_attribute where attrelid = 'articles'::regclass and attname = 'search'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('tsvector');
    expect(rows[0].gen).toBe('s');
  });

  it('has a GIN index that @@ uses', async () => {
    const def = await q("select indexdef from pg_indexes where indexname = 'articles_search_idx'");
    expect(def).toHaveLength(1);
    expect(def[0].indexdef).toMatch(/using gin/i);
    await q('set local enable_seqscan = off');
    const rows = await q("explain (format json) select id from articles where search @@ websearch_to_tsquery('english', 'postgres')");
    const raw = rows[0]['QUERY PLAN'];
    const plan = (typeof raw === 'string' ? JSON.parse(raw) : raw)[0].Plan;
    expect(nodesOf(plan).some((n) => n['Index Name'] === 'articles_search_idx')).toBe(true);
  });

  it('stays in step with inserts and updates', async () => {
    const [{ id }] = await q("insert into articles (title, body) values ('Rollback drills', 'Practise the rollback before you need it.') returning id");
    expect(await idsOf('rollbacks')).toContain(num(id));
    await q("update articles set title = 'Caching', body = 'Nothing to see here.' where id = 5");
    expect(await idsOf('redis')).toEqual([]);
  });
});

describe('search_articles', () => {
  it('matches word forms, not substrings: "deploying" finds deployed and deployments', async () => {
    expect(sorted(await idsOf('deploying'))).toEqual([2, 3]);
  });

  it('ranks a match in the title above a match in the body', async () => {
    const hits = await search('deploying');
    expect(hits[0].id).toBe(3);
    expect(hits[0].rank).toBeGreaterThan(hits[1].rank);
    const pg = await search('postgres');
    expect(pg[0].id).toBe(1);
    // One mention in a title beats two in a body.
    expect(await idsOf('kubernetes')).toEqual([14, 13]);
  });

  it('returns published articles only, whatever the case of the query', async () => {
    expect(sorted(await idsOf('postgres'))).toEqual([1, 2, 4, 7, 11]);
    expect(sorted(await idsOf('POSTGRES'))).toEqual([1, 2, 4, 7, 11]);
    expect(await idsOf('sharding')).toEqual([]);
  });

  it('orders by rank descending, then id', async () => {
    const hits = await search('postgres');
    for (let i = 1; i < hits.length; i++) {
      const a = hits[i - 1];
      const b = hits[i];
      assert(a.rank > b.rank || (a.rank === b.rank && a.id < b.id),
        `out of order: ${JSON.stringify(a)} before ${JSON.stringify(b)}`);
    }
  });

  it('treats several words as AND', async () => {
    expect(await idsOf('checkout billing')).toEqual([12]);
  });

  it('supports "quoted phrases": the words must be adjacent', async () => {
    expect(await idsOf('"connection pool"')).toEqual([4]);
  });

  it('supports -exclusion and OR', async () => {
    expect(sorted(await idsOf('postgres -replication'))).toEqual([1, 2, 4, 11]);
    expect(sorted(await idsOf('redis or memcached'))).toEqual([5, 6]);
  });

  it('returns nothing, without an error, for an empty or punctuation-only query', async () => {
    expect(await idsOf('')).toEqual([]);
    expect(await idsOf('!!! & |')).toEqual([]);
    expect(await idsOf('the')).toEqual([]);
  });

  it('returns at most 20 rows', async () => {
    expect((await search('minor fixes')).length).toBe(20);
  });
});
