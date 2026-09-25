beforeEach(async () => { await execUser(); });

async function planOf(sqlText) {
  const rows = await q('explain (format json) ' + sqlText);
  const raw = rows[0]['QUERY PLAN'];
  return (typeof raw === 'string' ? JSON.parse(raw) : raw)[0].Plan;
}
function nodesOf(plan) {
  const out = [plan];
  for (const child of plan.Plans || []) out.push(...nodesOf(child));
  return out;
}

/** The planner's row estimate for a filter on addresses, and the true count. */
async function estimateVsActual(where, params = []) {
  const plan = await planOf(`select * from addresses where ${where}`);
  const scan = nodesOf(plan).find((n) => n['Relation Name'] === 'addresses') || plan;
  const actual = num((await q(`select count(*) as n from addresses where ${where}`, params))[0].n);
  return { estimated: plan['Plan Rows'], scanEstimate: scan['Plan Rows'], actual };
}

const within = (estimated, actual, factor) => estimated >= actual / factor && estimated <= actual * factor;

describe('the statistics objects', () => {
  it('exist on addresses and have been computed', async () => {
    const rows = await q(`
      select s.stxname, s.stxkind::text as kinds, d.stxoid is not null as built
        from pg_statistic_ext s
        left join pg_statistic_ext_data d on d.stxoid = s.oid
       where s.stxrelid = 'addresses'::regclass`);
    assert(rows.length > 0, 'no CREATE STATISTICS on addresses');
    assert(rows.every((r) => r.built), 'a statistics object exists but has no data: run ANALYZE after creating it');
  });
});

describe('estimates for correlated filters', () => {
  it('city + district: within 2x of the 40 real rows', async () => {
    const { estimated, actual } = await estimateVsActual("city = 'city-7' and district = 'd-73'");
    expect(actual).toBe(40);
    assert(within(estimated, actual, 2), `the planner expects ${estimated} rows; there are ${actual}`);
  });

  it('holds for any city and district, not just one pair', async () => {
    for (const [city, district] of [['city-12', 'd-125'], ['city-49', 'd-499'], ['city-0', 'd-3']]) {
      const { estimated, actual } = await estimateVsActual(`city = '${city}' and district = '${district}'`);
      assert(within(estimated, actual, 2), `${city}/${district}: the planner expects ${estimated} rows; there are ${actual}`);
    }
  });
});

describe('estimates for grouping', () => {
  it('group by city, country: within 2x of the 50 real groups', async () => {
    const plan = await planOf('select city, country, count(*) from addresses group by city, country');
    const agg = nodesOf(plan).find((n) => /Aggregate/.test(n['Node Type']));
    const actual = (await q('select count(*)::int as n from (select distinct city, country from addresses) x'))[0].n;
    expect(actual).toBe(50);
    assert(within(agg['Plan Rows'], actual, 2), `the planner expects ${agg['Plan Rows']} groups; there are ${actual}`);
  });
});
