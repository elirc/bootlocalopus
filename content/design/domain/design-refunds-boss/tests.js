const { decide, evolve, rehydrate, summarize, allocate, DomainError, REFUND_WINDOW_DAYS } = solution;

const PLACED_AT = '2024-06-01T12:00:00Z';
const placeCommand = (o = {}) => ({
  type: 'PlaceOrder', orderId: 'o-1', currency: 'GBP', placedAt: PLACED_AT,
  discountMinor: 1000, shippingMinor: 399,
  lines: [
    { sku: 'coat', unitPriceMinor: 4999, quantity: 2 },
    { sku: 'socks', unitPriceMinor: 500, quantity: 3 },
    { sku: 'gift-card', unitPriceMinor: 2000, quantity: 1, finalSale: true },
  ],
  ...o,
});
const refund = (refundId, items, at = '2024-06-05T09:00:00Z') => ({ type: 'RequestRefund', refundId, items, at });
const codeOf = (fn) => {
  try { fn(); } catch (e) {
    if (!(e instanceof DomainError)) throw new Error(`expected a DomainError, got ${e && e.name}: ${e && e.message}`);
    expect(e.name).toBe('DomainError');
    return e.code;
  }
  return null;
};
/** Decide and apply, the way a command handler would. */
const run = (history, command) => [...history, ...decide(rehydrate(history), command)];
const placed = (o) => run([], placeCommand(o));

describe('allocate (the helper you need)', () => {
  it('splits exactly by largest remainder', () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocate(10, [3, 1, 3])).toEqual([4, 2, 4]);
    expect(allocate(1000, [9998, 1500, 2000])).toEqual([741, 111, 148]);
  });
});

describe('placing an order', () => {
  it('records the order as given', () => {
    const [event] = decide(null, placeCommand());
    expect(event).toEqual({
      type: 'OrderPlaced', orderId: 'o-1', currency: 'GBP', placedAt: PLACED_AT,
      discountMinor: 1000, shippingMinor: 399,
      lines: [
        { sku: 'coat', unitPriceMinor: 4999, quantity: 2, finalSale: false },
        { sku: 'socks', unitPriceMinor: 500, quantity: 3, finalSale: false },
        { sku: 'gift-card', unitPriceMinor: 2000, quantity: 1, finalSale: true },
      ],
    });
  });

  it('allocates the discount over lines by their value, and totals what was paid', () => {
    expect(summarize(rehydrate(placed()))).toEqual({
      orderId: 'o-1', currency: 'GBP', paidMinor: 12897, refundedMinor: 0,
      lines: [
        { sku: 'coat', quantity: 2, refundedQuantity: 0, netMinor: 9257 },
        { sku: 'socks', quantity: 3, refundedQuantity: 0, netMinor: 1389 },
        { sku: 'gift-card', quantity: 1, refundedQuantity: 0, netMinor: 1852 },
      ],
    });
  });

  it('rejects impossible orders', () => {
    expect(codeOf(() => decide(rehydrate(placed()), placeCommand()))).toBe('ALREADY_PLACED');
    expect(codeOf(() => decide(null, placeCommand({ lines: [] })))).toBe('INVALID_ORDER');
    expect(codeOf(() => decide(null, placeCommand({ lines: [{ sku: 'a', unitPriceMinor: 1, quantity: 0 }] })))).toBe('INVALID_ORDER');
    expect(codeOf(() => decide(null, placeCommand({ lines: [{ sku: 'a', unitPriceMinor: 1.5, quantity: 1 }] })))).toBe('INVALID_ORDER');
    expect(codeOf(() => decide(null, placeCommand({ lines: [{ sku: 'a', unitPriceMinor: 1, quantity: 1 }, { sku: 'a', unitPriceMinor: 1, quantity: 1 }] })))).toBe('INVALID_ORDER');
    expect(codeOf(() => decide(null, placeCommand({ discountMinor: 13499 })))).toBe('INVALID_DISCOUNT');
    expect(codeOf(() => decide(null, placeCommand({ discountMinor: -1 })))).toBe('INVALID_DISCOUNT');
    expect(decide(null, placeCommand({ discountMinor: 13498 }))).toHaveLength(1);
  });

  it('defaults discount and shipping to zero', () => {
    const cmd = placeCommand();
    delete cmd.discountMinor;
    delete cmd.shippingMinor;
    const [event] = decide(null, cmd);
    expect([event.discountMinor, event.shippingMinor]).toEqual([0, 0]);
  });
});

describe('refunding part of an order', () => {
  it('refunds units at their share of the discounted line amount', () => {
    const history = placed();
    const events = decide(rehydrate(history), refund('r1', [{ sku: 'socks', quantity: 2 }]));
    expect(events).toEqual([{
      type: 'RefundIssued', refundId: 'r1',
      items: [{ sku: 'socks', quantity: 2, amountMinor: 926 }],
      shippingMinor: 0, totalMinor: 926,
    }]);
  });

  it('spreads an uneven line over its units, so partial refunds add up to the line', () => {
    let h = run([], placeCommand({ discountMinor: 100, shippingMinor: 0, lines: [{ sku: 'mug', unitPriceMinor: 1000, quantity: 3 }] }));
    const amounts = [];
    for (const id of ['a', 'b', 'c']) {
      const [event] = decide(rehydrate(h), refund(id, [{ sku: 'mug', quantity: 1 }]));
      amounts.push(event.items[0].amountMinor);
      h = [...h, event];
    }
    expect(amounts).toEqual([967, 967, 966]);
    expect(summarize(rehydrate(h)).refundedMinor).toBe(2900);
  });

  it('refunds several lines at once, listing items in request order', () => {
    const [event] = decide(rehydrate(placed()), refund('r1', [{ sku: 'socks', quantity: 1 }, { sku: 'coat', quantity: 1 }]));
    expect(event.items).toEqual([
      { sku: 'socks', quantity: 1, amountMinor: 463 },
      { sku: 'coat', quantity: 1, amountMinor: 4629 },
    ]);
    expect(event.totalMinor).toBe(5092);
  });

  it('tracks refunded quantities and never refunds more than was bought', () => {
    let h = run(placed(), refund('r1', [{ sku: 'coat', quantity: 1 }]));
    expect(codeOf(() => decide(rehydrate(h), refund('r2', [{ sku: 'coat', quantity: 2 }])))).toBe('EXCEEDS_REFUNDABLE');
    h = run(h, refund('r2', [{ sku: 'coat', quantity: 1 }]));
    expect(summarize(rehydrate(h)).lines[0]).toEqual({ sku: 'coat', quantity: 2, refundedQuantity: 2, netMinor: 9257 });
    expect(codeOf(() => decide(rehydrate(h), refund('r3', [{ sku: 'coat', quantity: 1 }])))).toBe('EXCEEDS_REFUNDABLE');
  });

  it('rejects the whole request if any item is invalid', () => {
    const state = rehydrate(placed());
    expect(codeOf(() => decide(state, refund('r1', [{ sku: 'socks', quantity: 1 }, { sku: 'hat', quantity: 1 }])))).toBe('UNKNOWN_SKU');
    expect(codeOf(() => decide(state, refund('r1', [{ sku: 'socks', quantity: 1 }, { sku: 'coat', quantity: 3 }])))).toBe('EXCEEDS_REFUNDABLE');
    expect(codeOf(() => decide(state, refund('r1', [{ sku: 'socks', quantity: 0 }])))).toBe('INVALID_QUANTITY');
    expect(codeOf(() => decide(state, refund('r1', [{ sku: 'socks', quantity: 1.5 }])))).toBe('INVALID_QUANTITY');
    expect(codeOf(() => decide(state, refund('r1', [{ sku: 'socks', quantity: 1 }, { sku: 'socks', quantity: 1 }])))).toBe('INVALID_REQUEST');
    expect(codeOf(() => decide(state, refund('r1', [])))).toBe('EMPTY_REFUND');
  });

  it('refuses final-sale items', () => {
    expect(codeOf(() => decide(rehydrate(placed()), refund('r1', [{ sku: 'gift-card', quantity: 1 }])))).toBe('FINAL_SALE');
  });

  it('refuses refunds on an order that was never placed', () => {
    expect(codeOf(() => decide(null, refund('r1', [{ sku: 'coat', quantity: 1 }])))).toBe('NOT_PLACED');
  });
});

describe('the refund window', () => {
  it(`is open for exactly ${30} days after placing`, () => {
    expect(REFUND_WINDOW_DAYS).toBe(30);
    const state = rehydrate(placed());
    expect(decide(state, refund('r1', [{ sku: 'coat', quantity: 1 }], '2024-07-01T12:00:00Z'))).toHaveLength(1);
    expect(codeOf(() => decide(state, refund('r1', [{ sku: 'coat', quantity: 1 }], '2024-07-01T12:00:01Z')))).toBe('WINDOW_CLOSED');
  });
});

describe('shipping', () => {
  const noFinalSale = () => placed({
    lines: [
      { sku: 'coat', unitPriceMinor: 4999, quantity: 2 },
      { sku: 'socks', unitPriceMinor: 500, quantity: 3 },
    ],
  });

  it('comes back with the refund that returns the last unit, and only then', () => {
    let h = run(noFinalSale(), refund('r1', [{ sku: 'coat', quantity: 2 }]));
    expect(summarize(rehydrate(h)).refundedMinor).toBeGreaterThan(0);
    const [last] = decide(rehydrate(h), refund('r2', [{ sku: 'socks', quantity: 3 }]));
    expect(last.shippingMinor).toBe(399);
    expect(last.totalMinor).toBe(last.items[0].amountMinor + 399);
  });

  it('comes back in a single refund of everything', () => {
    const [event] = decide(rehydrate(noFinalSale()), refund('all', [{ sku: 'coat', quantity: 2 }, { sku: 'socks', quantity: 3 }]));
    expect(event.shippingMinor).toBe(399);
  });

  it('never comes back while a final-sale line remains', () => {
    const [event] = decide(rehydrate(placed()), refund('r1', [{ sku: 'coat', quantity: 2 }, { sku: 'socks', quantity: 3 }]));
    expect(event.shippingMinor).toBe(0);
  });
});

describe('idempotency', () => {
  it('a retried refund request records nothing new', () => {
    const h = run(placed(), refund('r1', [{ sku: 'coat', quantity: 1 }]));
    expect(decide(rehydrate(h), refund('r1', [{ sku: 'coat', quantity: 1 }]))).toEqual([]);
  });

  it('a retry still succeeds after the window has closed', () => {
    const h = run(placed(), refund('r1', [{ sku: 'coat', quantity: 1 }]));
    expect(decide(rehydrate(h), refund('r1', [{ sku: 'coat', quantity: 1 }], '2025-01-01T00:00:00Z'))).toEqual([]);
  });

  it('reusing a refund id for a different request is an error', () => {
    const h = run(placed(), refund('r1', [{ sku: 'coat', quantity: 1 }]));
    expect(codeOf(() => decide(rehydrate(h), refund('r1', [{ sku: 'socks', quantity: 1 }])))).toBe('REFUND_ID_REUSED');
  });
});

describe('the invariant: everything refunded == everything paid', () => {
  it('holds for any sequence of partial refunds', () => {
    const orders = [
      { discountMinor: 1000, shippingMinor: 399, lines: [{ sku: 'a', unitPriceMinor: 4999, quantity: 2 }, { sku: 'b', unitPriceMinor: 333, quantity: 7 }, { sku: 'c', unitPriceMinor: 1, quantity: 5 }] },
      { discountMinor: 1, shippingMinor: 0, lines: [{ sku: 'a', unitPriceMinor: 999, quantity: 3 }, { sku: 'b', unitPriceMinor: 1001, quantity: 3 }] },
      { discountMinor: 777, shippingMinor: 495, lines: [{ sku: 'a', unitPriceMinor: 0, quantity: 2 }, { sku: 'b', unitPriceMinor: 12345, quantity: 1 }, { sku: 'c', unitPriceMinor: 250, quantity: 9 }] },
    ];
    let seed = 7;
    const rand = (n) => { seed = (seed * 48271) % 2147483647; return seed % n; };
    for (const order of orders) {
      for (let round = 0; round < 5; round++) {
        let h = placed(order);
        const paid = summarize(rehydrate(h)).paidMinor;
        let n = 0;
        for (let guard = 0; guard < 500 && summarize(rehydrate(h)).lines.some((l) => l.refundedQuantity < l.quantity); guard++) {
          const open = summarize(rehydrate(h)).lines.filter((l) => l.refundedQuantity < l.quantity);
          const items = open.filter(() => rand(2) === 0).map((l) => ({ sku: l.sku, quantity: 1 + rand(l.quantity - l.refundedQuantity) }));
          if (items.length === 0) continue;
          const events = decide(rehydrate(h), refund('r' + n++, items));
          for (const e of events) {
            expect(e.totalMinor).toBe(e.items.reduce((s, i) => s + i.amountMinor, 0) + e.shippingMinor);
          }
          h = [...h, ...events];
          expect(summarize(rehydrate(h)).refundedMinor).toBeLessThanOrEqual(paid);
        }
        expect(summarize(rehydrate(h)).refundedMinor).toBe(paid);
      }
    }
  });
});

describe('evolve is pure', () => {
  it('does not mutate the previous state', () => {
    const before = rehydrate(placed());
    const copy = structuredClone(before);
    const [event] = decide(before, refund('r1', [{ sku: 'coat', quantity: 1 }]));
    evolve(before, event);
    expect(before).toEqual(copy);
  });
});
