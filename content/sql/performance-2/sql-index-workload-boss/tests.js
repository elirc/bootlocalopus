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
const shape = (plan) => nodesOf(plan)
  .map((n) => n['Node Type'] + (n['Index Name'] ? ` on ${n['Index Name']}` : '') + (n['Index Cond'] ? ` [${n['Index Cond']}]` : ''))
  .join(' -> ');

/** Asserts the plan reads no table sequentially, (optionally) never sorts, and seeks on every column in `seeks`. */
async function expectPlan(label, sqlText, { seeks, noSort }) {
  const plan = await planOf(sqlText);
  const nodes = nodesOf(plan);
  assert(!nodes.some((n) => n['Node Type'] === 'Seq Scan'), `${label}: a sequential scan remains: ${shape(plan)}`);
  if (noSort) {
    assert(!nodes.some((n) => /Sort/.test(n['Node Type'])), `${label}: the plan sorts; the index should deliver the order: ${shape(plan)}`);
  }
  const conds = nodes.map((n) => String(n['Index Cond'] || '')).join(' ');
  for (const col of seeks) {
    assert(conds.includes(col), `${label}: no index search on ${col} (an Index Cond, not a Filter): ${shape(plan)}`);
  }
}

const W1 = (tenant) => `select id, subject, priority, created_at from tickets
  where tenant_id = ${tenant} and status = 'open'
  order by created_at desc, id desc limit 50`;
const W2 = (assignee) => `select id, subject, status, created_at from tickets
  where assignee_id = ${assignee} and status in ('open', 'pending')
  order by priority desc, created_at, id limit 20`;
const W3 = (tenant) => `select id, subject from tickets
  where tenant_id = ${tenant} and lower(subject) like 'refund%'`;
const W4 = (before) => `select id, tenant_id from tickets
  where status = 'pending' and updated_at < '${before}'
  order by updated_at limit 100`;
const W5 = (tenant) => `select status, count(*) from tickets where tenant_id = ${tenant} group by status`;

/** Every index on tickets but the primary key: name, partial?, method, key column definitions. */
async function ticketIndexes() {
  const rows = await q(`
    select c.relname as name, i.indpred is not null as partial, am.amname as method,
           array(select pg_get_indexdef(i.indexrelid, k, true) from generate_series(1, i.indnkeyatts) as k) as cols
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      join pg_am am on am.oid = c.relam
     where i.indrelid = 'tickets'::regclass and not i.indisprimary
     order by c.relname`);
  return rows.map((r) => ({ ...r, cols: Array.isArray(r.cols) ? r.cols : String(r.cols).replace(/^\{|\}$/g, '').split(',') }));
}

describe('W1: a tenant\'s open tickets, newest first', () => {
  it('seeks on tenant and status and reads in order (no Sort)', async () => {
    await expectPlan('W1', W1(7), { seeks: ['tenant_id', 'status'], noSort: true });
    await expectPlan('W1 (tenant 12)', W1(12), { seeks: ['tenant_id', 'status'], noSort: true });
  });
});

describe('W2: an agent\'s queue by priority', () => {
  it('seeks on assignee and reads in queue order (no Sort)', async () => {
    await expectPlan('W2', W2(42), { seeks: ['assignee_id'], noSort: true });
    await expectPlan('W2 (assignee 5)', W2(5), { seeks: ['assignee_id'], noSort: true });
  });
});

describe('W3: subject prefix search within a tenant', () => {
  it('seeks on lower(subject)', async () => {
    await expectPlan('W3', W3(3), { seeks: ['tenant_id', 'lower(subject)'], noSort: false });
  });
  it('still finds the tickets', async () => {
    const rows = await q(W3(3));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.subject.toLowerCase().startsWith('refund'))).toBe(true);
  });
});

describe('W4: stale pending tickets across tenants', () => {
  it('seeks on updated_at and reads oldest first (no Sort)', async () => {
    await expectPlan('W4', W4('2024-03-01T00:00:00Z'), { seeks: ['updated_at'], noSort: true });
  });
});

describe('W5: status counts for a tenant', () => {
  it('seeks on tenant_id', async () => {
    await expectPlan('W5', W5(7), { seeks: ['tenant_id'], noSort: false });
  });
});

describe('the index budget', () => {
  it('has at most four indexes besides the primary key', async () => {
    const all = await ticketIndexes();
    assert(all.length <= 4, `tickets has ${all.length} indexes besides the primary key: ${all.map((i) => i.name).join(', ')}`);
  });

  it('has no index that another index makes redundant (its columns are a prefix of the other\'s)', async () => {
    const all = (await ticketIndexes()).filter((i) => !i.partial && i.method === 'btree');
    for (const a of all) {
      for (const b of all) {
        if (a.name === b.name || a.cols.length > b.cols.length) continue;
        const prefix = a.cols.every((c, k) => c === b.cols[k]);
        assert(!prefix, `${a.name} (${a.cols.join(', ')}) is a prefix of ${b.name} (${b.cols.join(', ')})`);
      }
    }
  });

  it('has no index on status alone', async () => {
    const all = await ticketIndexes();
    const lone = all.filter((i) => !i.partial && i.cols.length === 1 && i.cols[0] === 'status');
    expect(lone.map((i) => i.name)).toEqual([]);
  });
});
