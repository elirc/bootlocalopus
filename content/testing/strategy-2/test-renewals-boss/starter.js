// Your tests run against the correct renewDue, a concurrent rewrite, and eight bugs.

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

/**
 * A fake payment gateway. `charge` records every request and answers
 * { ok: true } unless you scripted something else for that customer:
 *   gateway.decline('sub_2_customer', 'card_declined')
 *   gateway.explode('sub_3_customer')   // charge rejects, like a network error
 */
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

describe('renewDue', () => {
  it('charges a due subscription', async () => {
    const gateway = fakeGateway();
    await solution.renewDue([aSub()], { now: clockAt('2031-05-10T12:00:00Z'), charge: gateway.charge });
    expect(gateway.requests.length).toBe(1);
  });

  // TODO: what was charged and with which key; what renewed and to when;
  // the boundary; paused and cancelled; duplicates; failures; month ends;
  // and a clock that disagrees with the real date.
});
