/** A valid, active, monthly subscription that is due at the default clock. */
function aSub(overrides = {}) {
  const id = overrides.id ?? 'sub_1';
  return {
    id,
    customerId: `${id}_customer`,
    plan: 'monthly',
    priceCents: 1200,
    status: 'active',
    renewsAt: '2031-05-10T08:00:00.000Z',
    ...overrides,
  };
}

/** A `now` function frozen at one instant. */
const clockAt = (iso) => () => Date.parse(iso);

/** A fake gateway: records requests, answers { ok: true } unless scripted per customer. */
function fakeGateway() {
  const requests = [];
  const scripted = new Map();
  return {
    requests,
    decline(customerId, reason) { scripted.set(customerId, { ok: false, reason }); },
    explode(customerId) { scripted.set(customerId, 'throw'); },
    async charge(request) {
      requests.push(request);
      const outcome = scripted.get(request.customerId) ?? { ok: true };
      if (outcome === 'throw') throw new Error('ECONNRESET');
      return outcome;
    },
  };
}

/** Runs the job; charge requests come back sorted by key, because call order is not promised. */
async function run(subs, { at = '2031-05-10T12:00:00Z', gateway = fakeGateway() } = {}) {
  const result = await solution.renewDue(subs, { now: clockAt(at), charge: gateway.charge });
  const requests = [...gateway.requests].sort((a, b) => (a.idempotencyKey < b.idempotencyKey ? -1 : 1));
  return { ...result, requests };
}

describe('renewDue: what gets charged', () => {
  it('charges each due subscription its price, for its own customer, with a per-period key', async () => {
    const { requests } = await run([
      aSub({ id: 'sub_1', priceCents: 1200 }),
      aSub({ id: 'sub_2', priceCents: 9900, renewsAt: '2031-05-01T00:00:00.000Z' }),
    ]);
    expect(requests).toEqual([
      { customerId: 'sub_1_customer', amountCents: 1200, idempotencyKey: 'renew-sub_1-2031-05-10T08:00:00.000Z' },
      { customerId: 'sub_2_customer', amountCents: 9900, idempotencyKey: 'renew-sub_2-2031-05-01T00:00:00.000Z' },
    ]);
  });

  it('uses the same idempotency key when the job is retried later for the same period', async () => {
    const first = await run([aSub()], { at: '2031-05-10T12:00:00Z' });
    const retry = await run([aSub()], { at: '2031-05-11T03:00:00Z' });
    expect(retry.requests[0].idempotencyKey).toBe(first.requests[0].idempotencyKey);
  });

  it('charges exactly at renewsAt, and not a millisecond before', async () => {
    const onTime = await run([aSub()], { at: '2031-05-10T08:00:00.000Z' });
    expect(onTime.requests).toHaveLength(1);
    const early = await run([aSub()], { at: '2031-05-10T07:59:59.999Z' });
    expect(early.requests).toEqual([]);
    expect(early.renewed).toEqual([]);
  });

  it('never charges paused or cancelled subscriptions', async () => {
    const { requests, renewed, failed } = await run([
      aSub({ id: 'sub_p', status: 'paused' }),
      aSub({ id: 'sub_c', status: 'cancelled' }),
    ]);
    expect(requests).toEqual([]);
    expect(renewed).toEqual([]);
    expect(failed).toEqual([]);
  });

  it('charges a subscription once when it appears twice in the input', async () => {
    const { requests, renewed } = await run([aSub(), aSub()]);
    expect(requests).toHaveLength(1);
    expect(renewed).toEqual([{ id: 'sub_1', renewsAt: '2031-06-10T08:00:00.000Z' }]);
  });

  it('uses the injected clock, not the real one', async () => {
    // Due by today's real date, not due by the clock we pass in.
    const { requests } = await run([aSub({ renewsAt: '2021-01-01T00:00:00.000Z' })], { at: '2020-06-01T00:00:00Z' });
    expect(requests).toEqual([]);
  });
});

describe('renewDue: results', () => {
  it('reports declines and network errors, and keeps charging the rest', async () => {
    const gateway = fakeGateway();
    gateway.decline('sub_2_customer', 'card_declined');
    gateway.explode('sub_1_customer');
    const { renewed, failed, requests } = await run(
      [aSub({ id: 'sub_1' }), aSub({ id: 'sub_2' }), aSub({ id: 'sub_3' })],
      { gateway },
    );
    expect(requests).toHaveLength(3);
    expect(renewed).toEqual([{ id: 'sub_3', renewsAt: '2031-06-10T08:00:00.000Z' }]);
    expect(failed).toEqual([
      { id: 'sub_1', reason: 'error' },
      { id: 'sub_2', reason: 'card_declined' },
    ]);
  });

  it('sorts renewed by id, whatever the input order', async () => {
    const { renewed } = await run([aSub({ id: 'sub_c' }), aSub({ id: 'sub_a' }), aSub({ id: 'sub_b' })]);
    expect(renewed.map((r) => r.id)).toEqual(['sub_a', 'sub_b', 'sub_c']);
  });

  it('moves an annual plan on twelve months', async () => {
    const { renewed } = await run([aSub({ plan: 'annual' })]);
    expect(renewed).toEqual([{ id: 'sub_1', renewsAt: '2032-05-10T08:00:00.000Z' }]);
  });

  it('clamps to the end of a shorter month', async () => {
    const { renewed } = await run(
      [
        aSub({ id: 'sub_jan31', renewsAt: '2032-01-31T08:00:00.000Z' }),
        aSub({ id: 'sub_leap', plan: 'annual', renewsAt: '2032-02-29T08:00:00.000Z' }),
      ],
      { at: '2032-03-01T00:00:00Z' },
    );
    expect(renewed).toEqual([
      { id: 'sub_jan31', renewsAt: '2032-02-29T08:00:00.000Z' },
      { id: 'sub_leap', renewsAt: '2033-02-28T08:00:00.000Z' },
    ]);
  });
});
