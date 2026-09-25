const { adaptLegacy, adaptModern, PaymentProviderError } = solution;

function fakeLegacy(respond, { sync = false } = {}) {
  const calls = [];
  return {
    calls,
    makePayment(req, cb) {
      calls.push(req);
      const [err, res] = respond(req);
      if (sync) cb(err, res);
      else setTimeout(() => cb(err, res), 0);
    },
  };
}
function fakeModern(respond) {
  const calls = [];
  return { calls, charges: { async create(req) { calls.push(req); return respond(req); } } };
}
const httpError = (statusCode, message = 'upstream said no') => Object.assign(new Error(message), statusCode === undefined ? {} : { statusCode });
const rejection = async (p) => { try { await p; } catch (e) { return e; } throw new Error('expected a rejection'); };

describe('legacy adapter: requests', () => {
  it('sends a two-decimal string and a lowercase currency', async () => {
    const legacy = fakeLegacy((r) => [null, { ref: 'L-1', state: 'OK', amount: r.amount }]);
    const gw = adaptLegacy(legacy);
    for (const cents of [1250, 5, 1999, 1990, 100, 123456]) {
      await gw.charge({ amountCents: cents, currency: 'GBP', token: 'tok_1' });
    }
    expect(legacy.calls.map((c) => c.amount)).toEqual(['12.50', '0.05', '19.99', '19.90', '1.00', '1234.56']);
    expect(legacy.calls[0]).toEqual({ amount: '12.50', currency: 'gbp', cardToken: 'tok_1' });
  });
});

describe('legacy adapter: results', () => {
  it('maps OK to paid, with cents parsed from the response amount', async () => {
    const gw = adaptLegacy(fakeLegacy(() => [null, { ref: 'L-17', state: 'OK', amount: '0.29' }]));
    expect(await gw.charge({ amountCents: 29, currency: 'GBP', token: 't' })).toEqual({ status: 'paid', id: 'L-17', amountCents: 29 });
  });
  it('parses awkward decimal amounts exactly', async () => {
    for (const [amount, cents] of [['0.57', 57], ['19.99', 1999], ['1.10', 110], ['4.35', 435], ['1005.03', 100503]]) {
      const gw = adaptLegacy(fakeLegacy(() => [null, { ref: 'L', state: 'OK', amount }]));
      const res = await gw.charge({ amountCents: 1, currency: 'GBP', token: 't' });
      expect(res.amountCents).toBe(cents);
    }
  });
  it('maps DECLINED to a resolved decline', async () => {
    const gw = adaptLegacy(fakeLegacy(() => [null, { ref: 'L-2', state: 'DECLINED', amount: '5.00' }]));
    expect(await gw.charge({ amountCents: 500, currency: 'GBP', token: 't' })).toEqual({ status: 'declined', id: 'L-2', reason: 'declined' });
  });
  it('works when the SDK calls back synchronously', async () => {
    const gw = adaptLegacy(fakeLegacy(() => [null, { ref: 'L-3', state: 'OK', amount: '1.00' }], { sync: true }));
    expect((await gw.charge({ amountCents: 100, currency: 'EUR', token: 't' })).status).toBe('paid');
  });
  it('turns transport errors into retryable PaymentProviderErrors', async () => {
    for (const code of ['TIMEOUT', 'NETWORK']) {
      const raw = { code };
      const e = await rejection(adaptLegacy(fakeLegacy(() => [raw])).charge({ amountCents: 100, currency: 'GBP', token: 't' }));
      expect(e).toBeInstanceOf(PaymentProviderError);
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe('PaymentProviderError');
      expect(e.provider).toBe('legacy');
      expect(e.retryable).toBe(true);
      expect(e.cause).toBe(raw);
    }
  });
  it('treats other legacy error codes as not retryable', async () => {
    const e = await rejection(adaptLegacy(fakeLegacy(() => [{ code: 'INVALID_REQUEST' }])).charge({ amountCents: 100, currency: 'GBP', token: 't' }));
    expect(e).toBeInstanceOf(PaymentProviderError);
    expect(e.retryable).toBe(false);
  });
});

describe('modern adapter', () => {
  it('sends minor units and an uppercase currency', async () => {
    const modern = fakeModern(() => ({ id: 'ch_1', status: 'succeeded' }));
    const res = await adaptModern(modern).charge({ amountCents: 1250, currency: 'gbp', token: 'tok_9' });
    expect(modern.calls).toEqual([{ amount_minor: 1250, currency: 'GBP', source: 'tok_9' }]);
    expect(res).toEqual({ status: 'paid', id: 'ch_1', amountCents: 1250 });
  });
  it('maps failed to a decline with the provider reason', async () => {
    const gw = adaptModern(fakeModern(() => ({ id: 'ch_2', status: 'failed', failure_reason: 'insufficient_funds' })));
    expect(await gw.charge({ amountCents: 100, currency: 'GBP', token: 't' })).toEqual({ status: 'declined', id: 'ch_2', reason: 'insufficient_funds' });
    const gw2 = adaptModern(fakeModern(() => ({ id: 'ch_3', status: 'failed' })));
    expect(await gw2.charge({ amountCents: 100, currency: 'GBP', token: 't' })).toEqual({ status: 'declined', id: 'ch_3', reason: 'declined' });
  });
  it('wraps 5xx and status-less errors as retryable, 4xx as not', async () => {
    const cases = [[503, true], [500, true], [undefined, true], [400, false], [402, false]];
    for (const [status, retryable] of cases) {
      const raw = httpError(status);
      const e = await rejection(adaptModern(fakeModern(() => { throw raw; })).charge({ amountCents: 100, currency: 'GBP', token: 't' }));
      expect(e).toBeInstanceOf(PaymentProviderError);
      expect(e.provider).toBe('modern');
      expect(e.retryable).toBe(retryable);
      expect(e.cause).toBe(raw);
    }
  });
});

describe('validation happens before the SDK is touched', () => {
  it('rejects non-positive and fractional amounts with a TypeError', async () => {
    const legacy = fakeLegacy(() => [null, { ref: 'L', state: 'OK', amount: '1.00' }]);
    const modern = fakeModern(() => ({ id: 'ch', status: 'succeeded' }));
    for (const gw of [adaptLegacy(legacy), adaptModern(modern)]) {
      for (const amountCents of [0, -100, 12.5, '100', NaN]) {
        const e = await rejection(gw.charge({ amountCents, currency: 'GBP', token: 't' }));
        expect(e).toBeInstanceOf(TypeError);
      }
    }
    expect(legacy.calls).toHaveLength(0);
    expect(modern.calls).toHaveLength(0);
  });
});

describe('the point: callers cannot tell them apart', () => {
  it('one checkout function works with either gateway', async () => {
    const checkout = async (gateway) => {
      const res = await gateway.charge({ amountCents: 4200, currency: 'GBP', token: 'tok' });
      return res.status === 'paid' ? `paid ${res.amountCents}` : `declined: ${res.reason}`;
    };
    expect(await checkout(adaptLegacy(fakeLegacy((r) => [null, { ref: 'L', state: 'OK', amount: r.amount }])))).toBe('paid 4200');
    expect(await checkout(adaptModern(fakeModern(() => ({ id: 'c', status: 'succeeded' }))))).toBe('paid 4200');
    expect(await checkout(adaptModern(fakeModern(() => ({ id: 'c', status: 'failed', failure_reason: 'card_declined' }))))).toBe('declined: card_declined');
  });
});
