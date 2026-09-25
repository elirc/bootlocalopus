const { evolve, rehydrate, decide, createEventStore, createGiftCardService, DomainError, ConcurrencyError } = solution;

const issued = { type: 'CardIssued', cardId: 'gc-1', amountMinor: 10000 };
const codeOf = (fn) => {
  try { fn(); } catch (e) {
    if (!(e instanceof DomainError)) throw new Error(`expected a DomainError, got ${e && e.name}: ${e && e.message}`);
    expect(e.name).toBe('DomainError');
    return e.code;
  }
  return null;
};
const rejection = async (promise) => {
  try { await promise; } catch (e) { return e; }
  throw new Error('expected a rejection');
};
const stateAfter = (...events) => rehydrate([issued, ...events]);

describe('rehydrate / evolve: state is a fold over the facts', () => {
  it('builds the current state from the history', () => {
    const s = stateAfter(
      { type: 'CardRedeemed', orderId: 'o1', amountMinor: 2500 },
      { type: 'CardRedeemed', orderId: 'o2', amountMinor: 1000 },
      { type: 'CardRefunded', orderId: 'o1', amountMinor: 500 },
    );
    expect(s).toMatchObject({ cardId: 'gc-1', balanceMinor: 7000, frozen: false });
    expect(stateAfter({ type: 'CardFrozen', reason: 'fraud' })).toMatchObject({ frozen: true, balanceMinor: 10000 });
  });

  it('starts from null for an empty history', () => {
    expect(rehydrate([])).toBeNull();
  });

  it('never mutates the state it is given', () => {
    const before = stateAfter({ type: 'CardRedeemed', orderId: 'o1', amountMinor: 2500 });
    const copy = structuredClone(before);
    evolve(before, { type: 'CardRedeemed', orderId: 'o2', amountMinor: 100 });
    evolve(before, { type: 'CardRefunded', orderId: 'o1', amountMinor: 100 });
    evolve(before, { type: 'CardFrozen', reason: 'x' });
    expect(before).toEqual(copy);
  });

  it('upcasts old events that stored `amount` instead of `amountMinor`', () => {
    const s = stateAfter(
      { type: 'CardRedeemed', orderId: 'o1', amount: 3000 },
      { type: 'CardRefunded', orderId: 'o1', amount: 1000 },
    );
    expect(s.balanceMinor).toBe(8000);
    expect(codeOf(() => decide(s, { type: 'Refund', orderId: 'o1', amountMinor: 2001 }))).toBe('REFUND_EXCEEDS_REDEMPTION');
  });

  it('ignores event types it does not know (written by newer code)', () => {
    expect(stateAfter({ type: 'CardRenamed', label: 'Birthday' })).toMatchObject({ balanceMinor: 10000, frozen: false });
  });
});

describe('decide: commands become events, or are refused', () => {
  it('issues a new card once', () => {
    expect(decide(null, { type: 'Issue', cardId: 'gc-1', amountMinor: 10000 })).toEqual([issued]);
    expect(codeOf(() => decide(stateAfter(), { type: 'Issue', cardId: 'gc-1', amountMinor: 5 }))).toBe('ALREADY_ISSUED');
    expect(codeOf(() => decide(null, { type: 'Issue', cardId: 'gc-1', amountMinor: 0 }))).toBe('INVALID_AMOUNT');
  });

  it('refuses anything but Issue on a card that does not exist', () => {
    expect(codeOf(() => decide(null, { type: 'Redeem', orderId: 'o1', amountMinor: 1 }))).toBe('NOT_FOUND');
  });

  it('redeems up to the balance', () => {
    const s = stateAfter({ type: 'CardRedeemed', orderId: 'o1', amountMinor: 9000 });
    expect(decide(s, { type: 'Redeem', orderId: 'o2', amountMinor: 1000 }))
      .toEqual([{ type: 'CardRedeemed', orderId: 'o2', amountMinor: 1000 }]);
    expect(codeOf(() => decide(s, { type: 'Redeem', orderId: 'o2', amountMinor: 1001 }))).toBe('INSUFFICIENT_FUNDS');
    expect(codeOf(() => decide(s, { type: 'Redeem', orderId: 'o3', amountMinor: -5 }))).toBe('INVALID_AMOUNT');
  });

  it('treats a repeated redeem for the same order as already done', () => {
    const s = stateAfter({ type: 'CardRedeemed', orderId: 'o1', amountMinor: 2500 });
    expect(decide(s, { type: 'Redeem', orderId: 'o1', amountMinor: 2500 })).toEqual([]);
  });

  it('refuses to redeem on a frozen card', () => {
    const s = stateAfter({ type: 'CardFrozen', reason: 'reported stolen' });
    expect(codeOf(() => decide(s, { type: 'Redeem', orderId: 'o1', amountMinor: 1 }))).toBe('CARD_FROZEN');
  });

  it('refunds no more than the order redeemed, across several refunds', () => {
    const s = stateAfter(
      { type: 'CardRedeemed', orderId: 'o1', amountMinor: 3000 },
      { type: 'CardRefunded', orderId: 'o1', amountMinor: 2000 },
    );
    expect(decide(s, { type: 'Refund', orderId: 'o1', amountMinor: 1000 }))
      .toEqual([{ type: 'CardRefunded', orderId: 'o1', amountMinor: 1000 }]);
    expect(codeOf(() => decide(s, { type: 'Refund', orderId: 'o1', amountMinor: 1001 }))).toBe('REFUND_EXCEEDS_REDEMPTION');
    expect(codeOf(() => decide(s, { type: 'Refund', orderId: 'nope', amountMinor: 1 }))).toBe('UNKNOWN_ORDER');
  });

  it('refunds still work on a frozen card (money goes back to the customer)', () => {
    const s = stateAfter({ type: 'CardRedeemed', orderId: 'o1', amountMinor: 3000 }, { type: 'CardFrozen', reason: 'x' });
    expect(decide(s, { type: 'Refund', orderId: 'o1', amountMinor: 3000 })).toHaveLength(1);
  });

  it('freezing is idempotent', () => {
    expect(decide(stateAfter(), { type: 'Freeze', reason: 'fraud' })).toEqual([{ type: 'CardFrozen', reason: 'fraud' }]);
    expect(decide(stateAfter({ type: 'CardFrozen', reason: 'fraud' }), { type: 'Freeze', reason: 'again' })).toEqual([]);
  });

  it('is pure: deciding twice changes nothing', () => {
    const s = stateAfter();
    const copy = structuredClone(s);
    decide(s, { type: 'Redeem', orderId: 'o1', amountMinor: 100 });
    decide(s, { type: 'Redeem', orderId: 'o1', amountMinor: 100 });
    expect(s).toEqual(copy);
  });
});

describe('createEventStore: append with an expected version', () => {
  it('appends and loads, with version = number of events', async () => {
    const store = createEventStore();
    expect(await store.load('gc-1')).toEqual({ events: [], version: 0 });
    await store.append('gc-1', [issued], 0);
    await store.append('gc-1', [{ type: 'CardFrozen', reason: 'x' }], 1);
    const { events, version } = await store.load('gc-1');
    expect(version).toBe(2);
    expect(events.map((e) => e.type)).toEqual(['CardIssued', 'CardFrozen']);
    expect(await store.load('other')).toEqual({ events: [], version: 0 });
  });

  it('refuses an append based on a stale version, and writes nothing', async () => {
    const store = createEventStore();
    await store.append('gc-1', [issued], 0);
    const e = await rejection(store.append('gc-1', [{ type: 'CardFrozen', reason: 'x' }], 0));
    expect(e).toBeInstanceOf(ConcurrencyError);
    expect(e.name).toBe('ConcurrencyError');
    expect((await store.load('gc-1')).version).toBe(1);
  });

  it('history cannot be edited through what load returns or what append was given', async () => {
    const store = createEventStore();
    const toWrite = [{ ...issued }];
    await store.append('gc-1', toWrite, 0);
    toWrite[0].amountMinor = 1;
    const loaded = await store.load('gc-1');
    loaded.events[0].amountMinor = 999999;
    loaded.events.push({ type: 'CardFrozen' });
    expect(await store.load('gc-1')).toEqual({ events: [issued], version: 1 });
  });
});

describe('createGiftCardService: load, decide, append', () => {
  it('handles a command end to end', async () => {
    const service = createGiftCardService(createEventStore());
    await service.handle('gc-1', { type: 'Issue', cardId: 'gc-1', amountMinor: 10000 });
    const result = await service.handle('gc-1', { type: 'Redeem', orderId: 'o1', amountMinor: 2500 });
    expect(result.events).toEqual([{ type: 'CardRedeemed', orderId: 'o1', amountMinor: 2500 }]);
    expect(result.state).toMatchObject({ balanceMinor: 7500 });
    expect(await rejection(service.handle('gc-1', { type: 'Redeem', orderId: 'o2', amountMinor: 8000 })))
      .toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  });

  it('a retried command that produces no events writes nothing', async () => {
    const store = createEventStore();
    const service = createGiftCardService(store);
    await service.handle('gc-1', { type: 'Issue', cardId: 'gc-1', amountMinor: 10000 });
    await service.handle('gc-1', { type: 'Redeem', orderId: 'o1', amountMinor: 2500 });
    const again = await service.handle('gc-1', { type: 'Redeem', orderId: 'o1', amountMinor: 2500 });
    expect(again.events).toEqual([]);
    expect(again.state).toMatchObject({ balanceMinor: 7500 });
    expect((await store.load('gc-1')).version).toBe(2);
  });

  it('two concurrent redeems cannot spend the same money twice', async () => {
    const store = createEventStore();
    const service = createGiftCardService(store);
    await service.handle('gc-1', { type: 'Issue', cardId: 'gc-1', amountMinor: 10000 });
    const results = await Promise.allSettled([
      service.handle('gc-1', { type: 'Redeem', orderId: 'o1', amountMinor: 6000 }),
      service.handle('gc-1', { type: 'Redeem', orderId: 'o2', amountMinor: 6000 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected').reason;
    expect(rejected).toBeInstanceOf(DomainError);
    expect(rejected.code).toBe('INSUFFICIENT_FUNDS');
    const { events } = await store.load('gc-1');
    expect(rehydrate(events).balanceMinor).toBe(4000);
  });

  it('two concurrent redeems that both fit both succeed, after a retry', async () => {
    const store = createEventStore();
    const service = createGiftCardService(store);
    await service.handle('gc-1', { type: 'Issue', cardId: 'gc-1', amountMinor: 10000 });
    await Promise.all([
      service.handle('gc-1', { type: 'Redeem', orderId: 'o1', amountMinor: 3000 }),
      service.handle('gc-1', { type: 'Redeem', orderId: 'o2', amountMinor: 3000 }),
    ]);
    const { events, version } = await store.load('gc-1');
    expect(version).toBe(3);
    expect(rehydrate(events).balanceMinor).toBe(4000);
  });

  it('gives up after 3 attempts under constant contention', async () => {
    let loads = 0;
    const real = createEventStore();
    await real.append('gc-1', [issued], 0);
    const contended = {
      async load(id) { loads++; return real.load(id); },
      async append(id, events, expected) { throw new ConcurrencyError(id, expected, expected + 1); },
    };
    const e = await rejection(createGiftCardService(contended).handle('gc-1', { type: 'Redeem', orderId: 'o1', amountMinor: 1 }));
    expect(e).toBeInstanceOf(ConcurrencyError);
    expect(loads).toBe(3);
  });

  it('does not retry other failures', async () => {
    let loads = 0;
    const real = createEventStore();
    await real.append('gc-1', [issued], 0);
    const broken = {
      async load(id) { loads++; return real.load(id); },
      async append() { throw new Error('disk full'); },
    };
    const e = await rejection(createGiftCardService(broken).handle('gc-1', { type: 'Redeem', orderId: 'o1', amountMinor: 1 }));
    expect(e.message).toBe('disk full');
    expect(loads).toBe(1);
  });
});
