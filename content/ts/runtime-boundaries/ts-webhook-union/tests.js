const { parseWebhook, describeEvent } = solution;

const CREATED = 1767225600; // 2026-01-01T00:00:00Z
const AT = new Date('2026-01-01T00:00:00Z');

const delivery = (type, data, extra = {}) => ({ id: 'evt_1', type, created: CREATED, data, ...extra });
const succeeded = (data = {}) => delivery('payment.succeeded', { payment_id: 'pay_1', amount: 1250, currency: 'gbp', ...data });

function event(body) {
  const r = parseWebhook(body);
  if (!r.ok) throw new Error('expected ok, got ' + JSON.stringify(r.errors));
  return r.event;
}
function errors(body) {
  const r = parseWebhook(body);
  if (r.ok) throw new Error('expected errors, got ' + JSON.stringify(r.event));
  return r.errors;
}

describe('known events', () => {
  it('parses payment.succeeded, converting the timestamp and currency', () => {
    expect(event(succeeded())).toStrictEqual({
      type: 'payment.succeeded', id: 'evt_1', createdAt: AT, paymentId: 'pay_1', amountCents: 1250, currency: 'GBP',
    });
  });
  it('parses payment.failed, with a null reason becoming "unknown"', () => {
    expect(event(delivery('payment.failed', { payment_id: 'pay_2', failure_reason: 'card_declined' }))).toStrictEqual({
      type: 'payment.failed', id: 'evt_1', createdAt: AT, paymentId: 'pay_2', reason: 'card_declined',
    });
    expect(event(delivery('payment.failed', { payment_id: 'pay_2', failure_reason: null })).reason).toBe('unknown');
  });
  it('parses refund.created', () => {
    expect(event(delivery('refund.created', { refund_id: 're_1', payment_id: 'pay_1', amount: 500 }))).toStrictEqual({
      type: 'refund.created', id: 'evt_1', createdAt: AT, refundId: 're_1', paymentId: 'pay_1', amountCents: 500,
    });
  });
  it('accepts a zero-amount payment', () => {
    expect(event(succeeded({ amount: 0 })).amountCents).toBe(0);
  });
  it('builds the event from checked fields only: extra keys do not leak through', () => {
    const e = event(succeeded({ card_number: '4242', payment_id: 'pay_9' }));
    expect(Object.keys(e).sort()).toEqual(['amountCents', 'createdAt', 'currency', 'id', 'paymentId', 'type']);
    const top = event({ ...succeeded(), livemode: true, admin: true });
    expect(Object.hasOwn(top, 'admin')).toBe(false);
    expect(Object.hasOwn(top, 'data')).toBe(false);
  });
});

describe('unknown event types', () => {
  it('are acknowledged, not rejected', () => {
    expect(parseWebhook(delivery('customer.updated', { anything: 1 }))).toStrictEqual({
      ok: true, event: { type: 'unknown', id: 'evt_1', createdAt: AT, originalType: 'customer.updated' },
    });
  });
  it('need no data at all', () => {
    const { data, ...noData } = delivery('invoice.voided', {});
    expect(event(noData).type).toBe('unknown');
  });
  it('include names that exist on Object.prototype', () => {
    expect(event(delivery('toString', {}))).toStrictEqual({ type: 'unknown', id: 'evt_1', createdAt: AT, originalType: 'toString' });
    expect(event(delivery('constructor', {})).type).toBe('unknown');
  });
});

describe('invalid deliveries', () => {
  it('rejects a body that is not an object', () => {
    for (const bad of [null, 'evt', 42, [succeeded()]]) {
      expect(errors(bad)).toEqual(['body: expected an object']);
    }
  });
  it('reports every envelope problem, and only those', () => {
    expect(errors({ id: '', type: 7, created: -5, data: 'nope' })).toEqual([
      'id: expected a non-empty string',
      'type: expected a non-empty string',
      'created: expected a positive integer',
    ]);
    expect(errors({ id: 'evt_1', type: 'payment.succeeded', created: 1.5 })).toEqual(['created: expected a positive integer']);
  });
  it('requires data to be an object for a known type', () => {
    expect(errors(delivery('payment.succeeded', null))).toEqual(['data: expected an object']);
    expect(errors(delivery('refund.created', [1]))).toEqual(['data: expected an object']);
  });
  it('reports every data problem with its path', () => {
    expect(errors(delivery('payment.succeeded', { amount: -1, currency: 'GBP' }))).toEqual([
      'data.payment_id: expected a non-empty string',
      'data.amount: expected a non-negative integer',
      'data.currency: expected one of gbp, eur, usd',
    ]);
    expect(errors(delivery('refund.created', { refund_id: 're_1', payment_id: 'pay_1', amount: 0 }))).toEqual([
      'data.amount: expected a positive integer',
    ]);
  });
  it('rejects amounts that are not whole cents', () => {
    expect(errors(succeeded({ amount: 12.5 }))).toEqual(['data.amount: expected a non-negative integer']);
    expect(errors(succeeded({ amount: '1250' }))).toEqual(['data.amount: expected a non-negative integer']);
  });
  it('distinguishes a missing failure_reason from a null one', () => {
    expect(errors(delivery('payment.failed', { payment_id: 'pay_2' }))).toEqual(['data.failure_reason: expected a string or null']);
  });
});

describe('describeEvent', () => {
  it('describes each kind of event', () => {
    expect(describeEvent(event(succeeded()))).toBe('Payment pay_1 succeeded: 12.50 GBP');
    expect(describeEvent(event(delivery('payment.failed', { payment_id: 'pay_2', failure_reason: null })))).toBe('Payment pay_2 failed: unknown');
    expect(describeEvent(event(delivery('refund.created', { refund_id: 're_1', payment_id: 'pay_1', amount: 5 })))).toBe('Refund re_1 for pay_1: 0.05');
    expect(describeEvent(event(delivery('customer.updated', {})))).toBe('Ignored customer.updated');
  });
});
