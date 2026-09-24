const EXPECTED = [
  { id: 1, order_id: 1001, customer_id: 7, coupon: 'SPRING', total_cents: 12000, bulk: false },
  { id: 3, order_id: 1003, customer_id: 7, coupon: null, total_cents: 25500, bulk: true },
  { id: 6, order_id: 1005, customer_id: 15, coupon: null, total_cents: 15000, bulk: true },
];

const nodesOf = (plan) => [plan, ...(plan.Plans || []).flatMap(nodesOf)];

async function rowsById() {
  const rows = await queryUser();
  return Object.fromEntries(rows.map((r) => [num(r.id), r]));
}

describe('the query', () => {
  it('returns the placed orders containing KB-1, in id order', async () => {
    const rows = await queryUser();
    expect(rows.map((r) => num(r.id))).toEqual([1, 3, 6]);
  });

  it('has exactly the columns in the brief', async () => {
    const rows = await queryUser();
    assert(rows.length > 0, 'the query returned no rows');
    expect(Object.keys(rows[0]).sort()).toEqual(['bulk', 'coupon', 'customer_id', 'id', 'order_id', 'total_cents']);
  });

  it('does not match a cancellation, KB-10, or KB-1 mentioned in a note', async () => {
    const ids = (await queryUser()).map((r) => num(r.id));
    expect(ids).not.toContain(4); // order.cancelled
    expect(ids).not.toContain(5); // sku KB-10
    expect(ids).not.toContain(7); // "note": "customer asked about KB-1"
  });

  it('extracts order_id and customer_id as numbers', async () => {
    const byId = await rowsById();
    for (const want of EXPECTED) {
      const got = byId[want.id];
      assert(got, `event ${want.id} is missing from the result`);
      expect(typeof got.order_id).toBe('number');
      expect(typeof got.customer_id).toBe('number');
      expect(got.order_id).toBe(want.order_id);
      expect(got.customer_id).toBe(want.customer_id);
    }
  });

  it('gives the coupon as text, and NULL when absent or JSON null', async () => {
    const byId = await rowsById();
    expect(byId[1].coupon).toBe('SPRING');
    expect(byId[3].coupon).toBeNull(); // no "coupon" key
    expect(byId[6].coupon).toBeNull(); // "coupon": null — ->> gives SQL NULL, not the string 'null'
  });

  it('sums qty * unit_cents over every item of the order', async () => {
    const byId = await rowsById();
    for (const want of EXPECTED) {
      expect(typeof byId[want.id].total_cents).toBe('number');
      expect(byId[want.id].total_cents).toBe(want.total_cents);
    }
  });

  it('flags bulk when any item (not only KB-1) has qty >= 3', async () => {
    const byId = await rowsById();
    expect(byId[1].bulk).toBe(false);
    expect(byId[3].bulk).toBe(true);
    expect(byId[6].bulk).toBe(true); // KB-1 x1, but CB-2 x4
  });
});

describe('the GIN index', () => {
  it('exists on payload with jsonb_path_ops', async () => {
    await execUser();
    const rows = await q("select indexdef from pg_indexes where tablename = 'events'");
    const gin = rows.map((r) => r.indexdef).filter((d) => /using gin/i.test(d));
    assert(gin.length > 0, `no GIN index on events; indexes are: ${rows.map((r) => r.indexdef).join('; ')}`);
    expect(gin.some((d) => /\(payload jsonb_path_ops\)/i.test(d))).toBe(true);
  });

  it('is used by a containment query', async () => {
    await execUser();
    await q('set local enable_seqscan = off');
    const rows = await q(`explain (format json) select id from events where payload @> '{"items": [{"sku": "KB-1"}]}'`);
    const raw = rows[0]['QUERY PLAN'];
    const plan = (typeof raw === 'string' ? JSON.parse(raw) : raw)[0].Plan;
    const used = nodesOf(plan).map((n) => n['Index Name']).filter(Boolean);
    assert(used.length > 0, `no index in the plan: ${nodesOf(plan).map((n) => n['Node Type']).join(' -> ')}`);
    const defs = await q('select indexdef from pg_indexes where indexname = any($1)', [used]);
    expect(defs.some((d) => /using gin/i.test(d.indexdef) && /jsonb_path_ops/i.test(d.indexdef))).toBe(true);
  });
});

describe('event_type', () => {
  it('is a stored generated text column', async () => {
    await execUser();
    const rows = await q(
      "select is_generated, data_type, generation_expression from information_schema.columns " +
      "where table_name = 'events' and column_name = 'event_type'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_generated).toBe('ALWAYS');
    expect(rows[0].data_type).toBe('text');
  });

  it('matches payload->>\'type\' on the existing rows', async () => {
    await execUser();
    const rows = await q("select count(*)::int as bad from events where event_type is distinct from payload->>'type'");
    expect(rows[0].bad).toBe(0);
    const placed = await q("select count(*)::int as n from events where event_type = 'order.placed'");
    expect(placed[0].n).toBe(6);
  });

  it('is filled in on insert and follows an update', async () => {
    await execUser();
    const inserted = await q(
      `insert into events (payload) values ('{"type": "order.shipped", "items": []}') returning id, event_type`,
    );
    expect(inserted[0].event_type).toBe('order.shipped');
    const updated = await q(
      `update events set payload = jsonb_set(payload, '{type}', '"order.delivered"') where id = $1 returning event_type`,
      [inserted[0].id],
    );
    expect(updated[0].event_type).toBe('order.delivered');
  });

  it('has a b-tree index', async () => {
    await execUser();
    const rows = await q("select indexdef from pg_indexes where tablename = 'events'");
    expect(rows.some((r) => /using btree \(event_type\)/i.test(r.indexdef))).toBe(true);
  });
});

describe('the CHECK constraint', () => {
  const insert = (payload) => q('insert into events (payload) values ($1::jsonb)', [payload]);

  it('accepts a well-formed event, including an empty items array', async () => {
    await execUser();
    await insert('{"type": "order.placed", "items": [{"sku": "KB-1", "qty": 1, "unit_cents": 9000}]}');
    await insert('{"type": "order.refunded", "items": []}');
  });

  it('rejects items that is a string', async () => {
    await execUser();
    await expect(insert('{"type": "order.placed", "items": "KB-1"}')).rejects.toThrow(/check constraint/);
  });

  it('rejects items that is an object', async () => {
    await execUser();
    await expect(insert('{"type": "order.placed", "items": {"sku": "KB-1"}}')).rejects.toThrow(/check constraint/);
  });

  it('rejects items that is JSON null', async () => {
    await execUser();
    await expect(insert('{"type": "order.placed", "items": null}')).rejects.toThrow(/check constraint/);
  });

  it('rejects a payload with no items key at all (a CHECK passes on NULL)', async () => {
    await execUser();
    await expect(insert('{"type": "order.placed"}')).rejects.toThrow(/check constraint/);
  });
});
