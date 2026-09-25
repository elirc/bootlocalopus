const { produce } = solution;

const makeBase = () => ({
  user: { name: 'ada', prefs: { theme: 'dark' } },
  cart: {
    items: [
      { sku: 'A', qty: 1 },
      { sku: 'B', qty: 2 },
      { sku: 'C', qty: 3 },
    ],
    coupon: null,
  },
  tags: ['new', 'vip'],
  createdAt: new Date(0),
  lookup: new Map([['A', 'Widget']]),
});

// A structural snapshot of plain data (Dates and Maps by identity), to prove base was not mutated.
function snapshot(value) {
  if (Array.isArray(value)) return { array: value.map(snapshot), length: value.length };
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.keys(value).map((k) => [k, snapshot(value[k])]);
  }
  return value;
}

// Reading any property of a revoked proxy throws, so this walks the whole result.
function assertNoDrafts(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const key of Object.keys(value)) assertNoDrafts(value[key], seen);
}

describe('input and no-op recipes', () => {
  it('rejects a base that is not a plain object or array', () => {
    class Cart {}
    for (const bad of [null, undefined, 5, 'x', new Date(), new Map(), new Cart()]) {
      expect(() => produce(bad, () => {})).toThrow(TypeError);
    }
  });

  it('returns base itself when nothing changed', () => {
    const base = makeBase();
    expect(produce(base, () => {})).toBe(base);
    expect(produce(base, (d) => { void d.user.prefs.theme; void d.cart.items.map((i) => i.qty); })).toBe(base);
  });

  it('assigning the value that is already there is not a change', () => {
    const base = makeBase();
    expect(produce(base, (d) => { d.user.name = 'ada'; d.cart.coupon = null; d.tags[0] = 'new'; })).toBe(base);
    expect(produce(base, (d) => { d.user = d.user; d.cart.items[1] = d.cart.items[1]; })).toBe(base);
  });

  it('ignores the recipe\'s return value', () => {
    const base = makeBase();
    expect(produce(base, () => ({ replaced: true }))).toBe(base);
    const next = produce(base, (d) => d.cart.items[0].qty++);
    expect(next.cart.items[0].qty).toBe(2);
  });
});

describe('structural sharing', () => {
  it('copies the path to a change and shares everything else', () => {
    const base = makeBase();
    const before = snapshot(base);
    const next = produce(base, (d) => { d.user.prefs.theme = 'light'; });
    expect(snapshot(base)).toEqual(before);
    expect(next).not.toBe(base);
    expect(next.user).not.toBe(base.user);
    expect(next.user.prefs).not.toBe(base.user.prefs);
    expect(next.user.prefs).toEqual({ theme: 'light' });
    expect(next.user.name).toBe('ada');
    expect(next.cart).toBe(base.cart);
    expect(next.tags).toBe(base.tags);
    expect(next.createdAt).toBe(base.createdAt);
    expect(next.lookup).toBe(base.lookup);
  });

  it('an object that was only read keeps its identity', () => {
    const base = makeBase();
    const next = produce(base, (d) => {
      void d.user.prefs.theme;
      d.cart.coupon = 'SAVE10';
    });
    expect(next.user).toBe(base.user);
    expect(next.cart).not.toBe(base.cart);
    expect(next.cart.items).toBe(base.cart.items);
    expect(next.cart.coupon).toBe('SAVE10');
    expect(base.cart.coupon).toBeNull();
  });

  it('mutating one array element copies the array and that element only', () => {
    const base = makeBase();
    const next = produce(base, (d) => { d.cart.items.find((i) => i.sku === 'B').qty++; });
    expect(next.cart.items[1]).toEqual({ sku: 'B', qty: 3 });
    expect(base.cart.items[1].qty).toBe(2);
    expect(next.cart.items).not.toBe(base.cart.items);
    expect(next.cart.items[0]).toBe(base.cart.items[0]);
    expect(next.cart.items[2]).toBe(base.cart.items[2]);
    expect(Array.isArray(next.cart.items)).toBe(true);
  });

  it('can add brand new keys and values, and mutate them in the same recipe', () => {
    const base = makeBase();
    const next = produce(base, (d) => {
      d.meta = { notes: [] };
      d.meta.notes.push('first');
      d.user.email = 'ada@example.com';
    });
    expect(next.meta).toEqual({ notes: ['first'] });
    expect(next.user).toEqual({ name: 'ada', prefs: { theme: 'dark' }, email: 'ada@example.com' });
    expect(next.user.prefs).toBe(base.user.prefs);
    expect('meta' in base).toBe(false);
    expect('email' in base.user).toBe(false);
  });

  it('the output of one produce is a valid base for the next', () => {
    const base = makeBase();
    const one = produce(base, (d) => { d.user.name = 'grace'; });
    const two = produce(one, (d) => { d.tags.push('beta'); });
    expect(two.user).toBe(one.user);
    expect(two.tags).toEqual(['new', 'vip', 'beta']);
    expect(one.tags).toBe(base.tags);
    expect(base.user.name).toBe('ada');
  });
});

describe('drafts during the recipe', () => {
  it('reading the same property twice gives the same draft, and reads see earlier writes', () => {
    const base = makeBase();
    let same;
    let seen;
    produce(base, (d) => {
      same = d.user === d.user && d.cart.items[0] === d.cart.items[0];
      d.user.name = 'grace';
      seen = d.user.name;
    });
    expect(same).toBe(true);
    expect(seen).toBe('grace');
  });

  it('does not draft Dates, Maps or class instances', () => {
    class Money { #cents = 250; get cents() { return this.#cents; } }
    const base = { ...makeBase(), price: new Money() };
    let result;
    const next = produce(base, (d) => {
      result = {
        time: d.createdAt.getTime(),
        sameDate: d.createdAt === base.createdAt,
        mapped: d.lookup.get('A'),
        cents: d.price.cents,
      };
    });
    expect(result).toEqual({ time: 0, sameDate: true, mapped: 'Widget', cents: 250 });
    expect(next).toBe(base);
  });

  it('delete, in, Object.keys and JSON.stringify see the current draft', () => {
    const base = makeBase();
    let during;
    const next = produce(base, (d) => {
      delete d.cart.coupon;
      d.user.role = 'admin';
      during = {
        couponIn: 'coupon' in d.cart,
        roleIn: 'role' in d.user,
        keys: Object.keys(d.user),
        json: JSON.stringify(d.user),
      };
    });
    expect(during).toEqual({
      couponIn: false,
      roleIn: true,
      keys: ['name', 'prefs', 'role'],
      json: '{"name":"ada","prefs":{"theme":"dark"},"role":"admin"}',
    });
    expect('coupon' in next.cart).toBe(false);
    expect('coupon' in base.cart).toBe(true);
  });
});

describe('array drafts', () => {
  it('push, pop, index assignment', () => {
    const base = makeBase();
    const next = produce(base, (d) => {
      d.tags.push('beta');
      d.tags[0] = 'returning';
      d.cart.items.pop();
    });
    expect(next.tags).toEqual(['returning', 'vip', 'beta']);
    expect(next.cart.items).toHaveLength(2);
    expect(next.cart.items[0]).toBe(base.cart.items[0]);
    expect(base.tags).toEqual(['new', 'vip']);
    expect(base.cart.items).toHaveLength(3);
  });

  it('splice and shift keep the untouched elements', () => {
    const base = makeBase();
    const spliced = produce(base, (d) => { d.cart.items.splice(1, 1); });
    expect(spliced.cart.items.map((i) => i.sku)).toEqual(['A', 'C']);
    expect(spliced.cart.items[1]).toBe(base.cart.items[2]);
    const shifted = produce(base, (d) => { d.cart.items.shift(); d.cart.items[0].qty = 20; });
    expect(shifted.cart.items.map((i) => i.qty)).toEqual([20, 3]);
    expect(shifted.cart.items[1]).toBe(base.cart.items[2]);
    expect(base.cart.items.map((i) => i.qty)).toEqual([1, 2, 3]);
  });

  it('sort reorders references without copying the elements', () => {
    const base = makeBase();
    const next = produce(base, (d) => { d.cart.items.sort((a, b) => b.qty - a.qty); });
    expect(next.cart.items[0]).toBe(base.cart.items[2]);
    expect(next.cart.items[1]).toBe(base.cart.items[1]);
    expect(next.cart.items[2]).toBe(base.cart.items[0]);
    expect(base.cart.items.map((i) => i.sku)).toEqual(['A', 'B', 'C']);
  });

  it('length = 0 empties the copy only', () => {
    const base = makeBase();
    const next = produce(base, (d) => { d.tags.length = 0; });
    expect(next.tags).toEqual([]);
    expect(base.tags).toEqual(['new', 'vip']);
  });
});

describe('no drafts leak into the result', () => {
  it('a draft moved elsewhere becomes its final value', () => {
    const base = makeBase();
    const unchanged = produce(base, (d) => { d.backup = d.user; });
    expect(unchanged.backup).toBe(base.user);
    expect(unchanged.user).toBe(base.user);

    const changed = produce(base, (d) => { d.user.name = 'grace'; d.backup = d.user; });
    assertNoDrafts(changed);
    expect(changed.backup).toBe(changed.user);
    expect(changed.backup.name).toBe('grace');
  });

  it('drafts inside new arrays and objects are replaced too', () => {
    const base = makeBase();
    const next = produce(base, (d) => {
      d.cart.items = d.cart.items.filter((i) => i.sku !== 'B');
      d.cart.items[0].qty = 10;
      d.favourites = [d.user, { item: d.cart.items[1] }];
    });
    assertNoDrafts(next);
    expect(next.cart.items).toEqual([{ sku: 'A', qty: 10 }, { sku: 'C', qty: 3 }]);
    expect(next.cart.items[1]).toBe(base.cart.items[2]);
    expect(next.favourites[0]).toBe(base.user);
    expect(next.favourites[1].item).toBe(base.cart.items[2]);
    expect(base.cart.items[0].qty).toBe(1);
  });
});

describe('drafts die with the recipe', () => {
  it('a draft used after produce returns throws a TypeError', () => {
    const base = makeBase();
    let leakedRoot;
    let leakedItems;
    produce(base, (d) => { leakedRoot = d; leakedItems = d.cart.items; });
    expect(() => leakedRoot.user).toThrow(TypeError);
    expect(() => { leakedItems.push({ sku: 'Z', qty: 1 }); }).toThrow(TypeError);
    expect(base.cart.items).toHaveLength(3);
  });

  it('a throwing recipe rethrows its error, leaves base alone and revokes its drafts', () => {
    const base = makeBase();
    const before = snapshot(base);
    const boom = new Error('boom');
    let leaked;
    expect(() => produce(base, (d) => {
      leaked = d.user;
      d.user.name = 'half-done';
      throw boom;
    })).toThrow('boom');
    let caught;
    try { produce(base, () => { throw boom; }); } catch (e) { caught = e; }
    expect(caught).toBe(boom);
    expect(snapshot(base)).toEqual(before);
    expect(() => leaked.name).toThrow(TypeError);
  });
});
