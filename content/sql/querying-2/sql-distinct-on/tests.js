const iso = (d) => (d === null ? null : new Date(d).toISOString());
const rows = async () => (await queryUser()).map((r) => ({
  order_ref: r.order_ref, status: r.status, happened_at: iso(r.happened_at),
}));

describe('latest event per shipment', () => {
  it('has the expected columns', async () => {
    const r = await queryUser();
    expect(Object.keys(r[0]).sort()).toEqual(['happened_at', 'order_ref', 'shipment_id', 'status']);
  });

  it('returns one row per shipment, including the one with no events', async () => {
    const r = await rows();
    expect(r).toHaveLength(5);
    expect(r.map((x) => x.order_ref).sort()).toEqual(['ORD-1001', 'ORD-1002', 'ORD-1003', 'ORD-1004', 'ORD-1005']);
  });

  it('picks the latest event by time, not by id', async () => {
    const r = await rows();
    expect(r.find((x) => x.order_ref === 'ORD-1002'))
      .toEqual({ order_ref: 'ORD-1002', status: 'delivered', happened_at: '2024-05-03T12:00:00.000Z' });
    expect(r.find((x) => x.order_ref === 'ORD-1001').status).toBe('in_transit');
  });

  it('breaks a timestamp tie by the greater id', async () => {
    const r = await rows();
    expect(r.find((x) => x.order_ref === 'ORD-1003').status).toBe('returned_to_sender');
  });

  it('reports nulls for a shipment with no events', async () => {
    const r = await rows();
    expect(r.find((x) => x.order_ref === 'ORD-1005'))
      .toEqual({ order_ref: 'ORD-1005', status: null, happened_at: null });
  });

  it('orders by happened_at desc, nulls last, then shipment_id', async () => {
    const r = await rows();
    expect(r.map((x) => x.order_ref)).toEqual(['ORD-1003', 'ORD-1002', 'ORD-1004', 'ORD-1001', 'ORD-1005']);
  });
});

describe('against new data', () => {
  it('follows a newer event and keeps the tiebreak when two shipments share a time', async () => {
    const [{ id: s1 }] = await q("select id from shipments where order_ref = 'ORD-1001'");
    const [{ id: s4 }] = await q("select id from shipments where order_ref = 'ORD-1004'");
    await q("insert into shipment_events (shipment_id, status, happened_at) values ($1, 'delivered', '2024-05-06 10:00+00')", [s1]);
    await q("insert into shipment_events (shipment_id, status, happened_at) values ($1, 'picked_up', '2024-05-06 10:00+00')", [s4]);
    const r = await q(userSql);
    const top = r.slice(0, 2).map((x) => [x.order_ref, x.status]);
    expect(top).toEqual([['ORD-1001', 'delivered'], ['ORD-1004', 'picked_up']]);
  });

  it('ignores an event for an older time even when inserted last', async () => {
    const [{ id: s2 }] = await q("select id from shipments where order_ref = 'ORD-1002'");
    await q("insert into shipment_events (shipment_id, status, happened_at) values ($1, 'label_printed', '2024-05-01 09:30+00')", [s2]);
    const r = await q(userSql);
    expect(r.find((x) => x.order_ref === 'ORD-1002').status).toBe('delivered');
  });
});
