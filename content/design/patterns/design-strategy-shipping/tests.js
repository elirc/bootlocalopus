const { standard, express, collection, createShippingQuoter, ShippingUnavailableError } = solution;
const order = (o = {}) => ({ subtotalCents: 2000, weightGrams: 1000, country: 'GB', ...o });

describe('the built-in strategies', () => {
  it('standard costs 499, free from 5000', () => {
    expect(standard.id).toBe('standard');
    expect(standard.label).toBe('Standard (3-5 days)');
    expect(standard.costCents(order({ subtotalCents: 4999 }))).toBe(499);
    expect(standard.costCents(order({ subtotalCents: 5000 }))).toBe(0);
    expect(standard.isAvailable(order({ country: 'FR' }))).toBe(true);
  });
  it('express charges 150 per started kg above 2 kg', () => {
    expect(express.id).toBe('express');
    expect(express.label).toBe('Express (next day)');
    expect(express.costCents(order({ weightGrams: 500 }))).toBe(999);
    expect(express.costCents(order({ weightGrams: 2000 }))).toBe(999);
    expect(express.costCents(order({ weightGrams: 2001 }))).toBe(1149);
    expect(express.costCents(order({ weightGrams: 3000 }))).toBe(1149);
    expect(express.costCents(order({ weightGrams: 3001 }))).toBe(1299);
    expect(express.costCents(order({ weightGrams: 12300 }))).toBe(999 + 150 * 11);
  });
  it('express is GB only', () => {
    expect(express.isAvailable(order({ country: 'GB' }))).toBe(true);
    expect(express.isAvailable(order({ country: 'IE' }))).toBe(false);
  });
  it('collection is free, GB only, up to 20 kg', () => {
    expect(collection.id).toBe('collection');
    expect(collection.label).toBe('Click & collect');
    expect(collection.costCents(order())).toBe(0);
    expect(collection.isAvailable(order({ weightGrams: 20000 }))).toBe(true);
    expect(collection.isAvailable(order({ weightGrams: 20001 }))).toBe(false);
    expect(collection.isAvailable(order({ country: 'DE' }))).toBe(false);
  });
});

describe('createShippingQuoter', () => {
  it('lists available options cheapest first', () => {
    const q = createShippingQuoter([express, standard, collection]);
    expect(q.quotes(order({ weightGrams: 2500 }))).toEqual([
      { id: 'collection', label: 'Click & collect', costCents: 0 },
      { id: 'standard', label: 'Standard (3-5 days)', costCents: 499 },
      { id: 'express', label: 'Express (next day)', costCents: 1149 },
    ]);
  });
  it('keeps the given order between equal costs', () => {
    const q = createShippingQuoter([standard, collection]);
    expect(q.quotes(order({ subtotalCents: 9000 })).map((x) => x.id)).toEqual(['standard', 'collection']);
    const r = createShippingQuoter([collection, standard]);
    expect(r.quotes(order({ subtotalCents: 9000 })).map((x) => x.id)).toEqual(['collection', 'standard']);
  });
  it('hides unavailable options', () => {
    const q = createShippingQuoter([standard, express, collection]);
    expect(q.quotes(order({ country: 'FR' })).map((x) => x.id)).toEqual(['standard']);
  });
  it('quote() prices one option', () => {
    const q = createShippingQuoter([standard, express, collection]);
    expect(q.quote('express', order({ weightGrams: 4000 }))).toBe(1299);
    expect(q.quote('standard', order({ subtotalCents: 6000 }))).toBe(0);
  });
  it('quote() rejects unknown and unavailable ids with ShippingUnavailableError', () => {
    const q = createShippingQuoter([standard, express]);
    let caught;
    try { q.quote('express', order({ country: 'US' })); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ShippingUnavailableError);
    expect(caught).toBeInstanceOf(Error);
    expect(caught.name).toBe('ShippingUnavailableError');
    expect(caught.id).toBe('express');
    expect(() => q.quote('teleport', order())).toThrow(ShippingUnavailableError);
    expect(() => q.quote('collection', order())).toThrow(ShippingUnavailableError);
  });
  it('rejects duplicate ids', () => {
    expect(() => createShippingQuoter([standard, { ...standard }])).toThrow();
  });
});

describe('open for extension', () => {
  const drone = {
    id: 'drone',
    label: 'Drone (1 hour)',
    isAvailable: (o) => o.weightGrams <= 2000 && o.country === 'GB',
    costCents(o) {
      if (o.weightGrams > 2000 || o.country !== 'GB') throw new Error('drone priced for an order it cannot carry');
      return 250;
    },
  };
  it('works with a strategy it has never seen', () => {
    const q = createShippingQuoter([standard, drone, express]);
    expect(q.quotes(order({ weightGrams: 1500 })).map((x) => [x.id, x.costCents])).toEqual([
      ['drone', 250], ['standard', 499], ['express', 999],
    ]);
    expect(q.quote('drone', order({ weightGrams: 1500 }))).toBe(250);
  });
  it('never prices an unavailable strategy', () => {
    const q = createShippingQuoter([standard, drone]);
    expect(q.quotes(order({ weightGrams: 9000 })).map((x) => x.id)).toEqual(['standard']);
    expect(() => q.quote('drone', order({ country: 'NO' }))).toThrow(ShippingUnavailableError);
  });
});
