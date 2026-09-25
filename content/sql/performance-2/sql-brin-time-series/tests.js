beforeEach(async () => { await execUser(); });

function nodesOf(plan) {
  const out = [plan];
  for (const child of plan.Plans || []) out.push(...nodesOf(child));
  return out;
}
async function planOf(sqlText) {
  await q('set local enable_seqscan = off');
  const rows = await q('explain (format json) ' + sqlText);
  const raw = rows[0]['QUERY PLAN'];
  return (typeof raw === 'string' ? JSON.parse(raw) : raw)[0].Plan;
}
const shape = (plan) => nodesOf(plan).map((n) => n['Node Type'] + (n['Index Name'] ? ` on ${n['Index Name']}` : '')).join(' -> ');

/** Every index on readings: name, access method, key column, reloptions. */
async function indexes() {
  return q(`
    select c.relname as name, am.amname as method,
           (select string_agg(a.attname, ',') from unnest(i.indkey) k join pg_attribute a
              on a.attrelid = i.indrelid and a.attnum = k) as columns,
           coalesce(array_to_string(c.reloptions, ','), '') as options
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      join pg_am am on am.oid = c.relam
     where i.indrelid = 'readings'::regclass
     order by c.relname`);
}

describe('recorded_at', () => {
  it('has a BRIN index readings_recorded_at_brin with pages_per_range = 32', async () => {
    const idx = (await indexes()).find((i) => i.name === 'readings_recorded_at_brin');
    assert(idx, 'no index named readings_recorded_at_brin');
    expect(idx.method).toBe('brin');
    expect(idx.columns).toBe('recorded_at');
    expect(idx.options).toContain('pages_per_range=32');
  });

  it('answers a time-range query through the BRIN index', async () => {
    const plan = await planOf("select * from readings where recorded_at >= '2024-03-02T00:00:00Z' and recorded_at < '2024-03-02T06:00:00Z'");
    const nodes = nodesOf(plan);
    assert(nodes.some((n) => n['Index Name'] === 'readings_recorded_at_brin'), `expected the BRIN index, got ${shape(plan)}`);
    expect(nodes.some((n) => n['Node Type'] === 'Seq Scan')).toBe(false);
  });

  it('is a small fraction of the size of a B-tree over as many rows', async () => {
    const r = await q(`select pg_relation_size('readings_recorded_at_brin') as brin,
                              pg_relation_size('readings_pkey') as btree`);
    const brin = num(r[0].brin);
    const btree = num(r[0].btree);
    assert(brin * 10 < btree, `BRIN is ${brin} bytes, the primary key B-tree ${btree}: expected BRIN under a tenth`);
  });
});

describe('device_time', () => {
  it('has a B-tree readings_device_time_idx, and no BRIN index', async () => {
    const all = await indexes();
    const idx = all.find((i) => i.name === 'readings_device_time_idx');
    assert(idx, 'no index named readings_device_time_idx');
    expect(idx.method).toBe('btree');
    expect(idx.columns).toBe('device_time');
    const brinOnDevice = all.filter((i) => i.method === 'brin' && i.columns === 'device_time');
    expect(brinOnDevice).toEqual([]);
  });

  it('answers a range query on device_time through the B-tree', async () => {
    const plan = await planOf("select * from readings where device_time >= '2024-03-02T00:00:00Z' and device_time < '2024-03-02T01:00:00Z'");
    assert(nodesOf(plan).some((n) => n['Index Name'] === 'readings_device_time_idx'), `expected the B-tree, got ${shape(plan)}`);
  });
});

describe('your last statement', () => {
  it('reports the correlation of both columns, from pg_stats (after ANALYZE)', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => r.attname)).toEqual(['device_time', 'recorded_at']);
    const corr = Object.fromEntries(rows.map((r) => [r.attname, Number(r.correlation)]));
    assert(corr.recorded_at > 0.99, `recorded_at correlation is ${corr.recorded_at}; did you ANALYZE?`);
    assert(Math.abs(corr.device_time) < 0.3, `device_time correlation is ${corr.device_time}`);
  });
});
