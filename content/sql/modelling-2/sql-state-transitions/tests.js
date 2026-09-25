const attempt = async (sql, params) => {
  await q('savepoint probe');
  try {
    await q(sql, params);
    await q('release savepoint probe');
    return null;
  } catch (e) {
    await q('rollback to savepoint probe');
    return e;
  }
};

const newOrder = async (status = 'pending') => {
  const [{ id }] = await q("insert into orders (customer) values ('T') returning id");
  // Walk the order to the requested status through legal steps.
  const path = { pending: [], paid: ['paid'], shipped: ['paid', 'shipped'],
    delivered: ['paid', 'shipped', 'delivered'], cancelled: ['cancelled'] }[status];
  for (const s of path) await q('update orders set status = $1 where id = $2', [s, id]);
  return num(id);
};
const move = (id, to) => attempt('update orders set status = $1 where id = $2', [to, id]);
const statusOf = async (id) => (await q('select status from orders where id = $1', [id]))[0].status;

describe('lookup tables', () => {
  it('holds exactly the five statuses with their terminal flags', async () => {
    const rows = await q('select code, is_terminal from order_statuses order by code');
    expect(rows).toEqual([
      { code: 'cancelled', is_terminal: true },
      { code: 'delivered', is_terminal: true },
      { code: 'paid', is_terminal: false },
      { code: 'pending', is_terminal: false },
      { code: 'shipped', is_terminal: false },
    ]);
  });

  it('holds exactly the five transitions', async () => {
    const rows = await q(
      "select from_status || '>' || to_status as t from order_status_transitions order by 1",
    );
    expect(rows.map((r) => r.t)).toEqual([
      'paid>cancelled', 'paid>shipped', 'pending>cancelled', 'pending>paid', 'shipped>delivered',
    ]);
  });

  it('refuses a transition to a status that does not exist', async () => {
    const err = await attempt("insert into order_status_transitions values ('paid', 'lost')");
    expect(err && err.code).toBe('23503');
  });

  it('refuses an order with an unknown status', async () => {
    const err = await attempt("insert into orders (customer, status) values ('X', 'teleported')");
    expect(err && err.code).toBe('23503');
  });
});

describe('allowed transitions', () => {
  it('walks an order from pending to delivered', async () => {
    const id = await newOrder('pending');
    for (const s of ['paid', 'shipped', 'delivered']) expect(await move(id, s)).toBeNull();
    expect(await statusOf(id)).toBe('delivered');
  });

  it('cancels from pending and from paid', async () => {
    expect(await move(await newOrder('pending'), 'cancelled')).toBeNull();
    expect(await move(await newOrder('paid'), 'cancelled')).toBeNull();
  });

  it('moves the fixture rows too', async () => {
    const [{ id }] = await q("select id from orders where customer = 'Chen'");
    expect(await move(num(id), 'delivered')).toBeNull();
  });
});

describe('forbidden transitions', () => {
  it('refuses to reopen a delivered order, with the documented error', async () => {
    const id = await newOrder('delivered');
    const err = await move(id, 'pending');
    expect(err && err.code).toBe('23514');
    expect(String(err && err.message)).toContain('invalid transition delivered -> pending');
    expect(await statusOf(id)).toBe('delivered');
  });

  it('refuses to skip a step', async () => {
    const err = await move(await newOrder('pending'), 'shipped');
    expect(err && err.code).toBe('23514');
    expect(String(err && err.message)).toContain('invalid transition pending -> shipped');
  });

  it('refuses to ship a cancelled order', async () => {
    const err = await move(await newOrder('cancelled'), 'shipped');
    expect(err && err.code).toBe('23514');
  });

  it('refuses to cancel a shipped order', async () => {
    const err = await move(await newOrder('shipped'), 'cancelled');
    expect(err && err.code).toBe('23514');
  });

  it('checks every row of a multi-row update', async () => {
    const a = await newOrder('pending');
    const b = await newOrder('delivered');
    const err = await attempt("update orders set status = 'paid' where id in ($1, $2)", [a, b]);
    expect(err && err.code).toBe('23514');
    expect(await statusOf(a)).toBe('pending');
  });
});

describe('not transitions', () => {
  it('allows setting status to the value it already has', async () => {
    const id = await newOrder('delivered');
    expect(await move(id, 'delivered')).toBeNull();
  });

  it('allows updating another column', async () => {
    const id = await newOrder('cancelled');
    expect(await attempt("update orders set customer = 'Renamed' where id = $1", [id])).toBeNull();
  });
});

describe('rules are data', () => {
  it('honours a transition added at runtime', async () => {
    const id = await newOrder('cancelled');
    expect((await move(id, 'pending')) && true).toBe(true);
    await q("insert into order_status_transitions values ('cancelled', 'pending')");
    expect(await move(id, 'pending')).toBeNull();
    expect(await statusOf(id)).toBe('pending');
  });

  it('stops honouring a transition removed at runtime', async () => {
    await q("delete from order_status_transitions where from_status = 'paid' and to_status = 'shipped'");
    const err = await move(await newOrder('paid'), 'shipped');
    expect(err && err.code).toBe('23514');
  });
});
