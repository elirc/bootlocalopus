const STATUSES = ['cart', 'pending_payment', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'];
const EVENTS = ['checkout', 'pay', 'payment_failed', 'ship', 'deliver', 'cancel', 'refund'];

// The answer key, copied from the spec: [from, event, to].
const LEGAL = [
  ['cart', 'checkout', 'pending_payment'],
  ['cart', 'cancel', 'cancelled'],
  ['pending_payment', 'pay', 'paid'],
  ['pending_payment', 'payment_failed', 'cart'],
  ['pending_payment', 'cancel', 'cancelled'],
  ['paid', 'ship', 'shipped'],
  ['paid', 'cancel', 'cancelled'],
  ['shipped', 'deliver', 'delivered'],
  ['delivered', 'refund', 'refunded'],
];
const isLegal = (from, event) => LEGAL.some(([f, e]) => f === from && e === event);

describe('nextStatus: every legal move', () => {
  for (const [from, event, to] of LEGAL) {
    it(`${from} --${event}--> ${to}`, () => {
      expect(solution.nextStatus(from, event)).toBe(to);
    });
  }
});

describe('nextStatus: every other pair throws InvalidTransition', () => {
  for (const from of STATUSES) {
    for (const event of EVENTS) {
      if (isLegal(from, event)) continue;
      it(`${from} cannot ${event}`, () => {
        expect(() => solution.nextStatus(from, event)).toThrow(solution.InvalidTransition);
        expect(() => solution.nextStatus(from, event)).toThrow({ from, event });
      });
    }
  }

  it('rejects unknown and inherited names', () => {
    for (const [from, event] of [['cart', 'toString'], ['cart', 'explode'], ['toString', 'pay'], ['archived', 'cancel']]) {
      expect(() => solution.nextStatus(from, event)).toThrow({ from, event });
    }
  });
});

describe('allowedEvents', () => {
  it('lists the legal events for each status, alphabetically', () => {
    for (const status of STATUSES) {
      const expected = LEGAL.filter(([f]) => f === status).map(([, e]) => e).sort();
      expect(solution.allowedEvents(status)).toEqual(expected);
    }
  });

  it('spells out one case, so the test does not only agree with itself', () => {
    expect(solution.allowedEvents('pending_payment')).toEqual(['cancel', 'pay', 'payment_failed']);
  });

  it('is empty for terminal and unknown statuses', () => {
    expect(solution.allowedEvents('cancelled')).toEqual([]);
    expect(solution.allowedEvents('refunded')).toEqual([]);
    expect(solution.allowedEvents('archived')).toEqual([]);
  });
});
