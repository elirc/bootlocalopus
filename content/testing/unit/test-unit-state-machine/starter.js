const STATUSES = ['cart', 'pending_payment', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'];
const EVENTS = ['checkout', 'pay', 'payment_failed', 'ship', 'deliver', 'cancel', 'refund'];

describe('nextStatus', () => {
  it('checks out a cart', () => {
    expect(solution.nextStatus('cart', 'checkout')).toBe('pending_payment');
  });

  it('ships a paid order', () => {
    expect(solution.nextStatus('paid', 'ship')).toBe('shipped');
  });

  it('refuses to ship a cart', () => {
    expect(() => solution.nextStatus('cart', 'ship')).toThrow();
  });

  // TODO: every legal move, then every OTHER (status, event) pair from STATUSES x EVENTS.
});
