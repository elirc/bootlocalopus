const { readonlyView, isReadonlyView } = solution;

const makeState = () => ({
  user: { name: 'ada', roles: ['admin'] },
  cart: { items: [{ sku: 'A1', qty: 1 }], total: 1200 },
  createdAt: new Date(0),
  lookup: new Map([['A1', 'Widget']]),
});

function thrownBy(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected a TypeError, nothing was thrown');
}

describe('reads', () => {
  it('reads through, including nested values', () => {
    const view = readonlyView(makeState());
    expect(view.user.name).toBe('ada');
    expect(view.cart.items[0].sku).toBe('A1');
    expect(view.cart.items.length).toBe(1);
  });

  it('is live: later changes to the target are visible', () => {
    const state = makeState();
    const view = readonlyView(state);
    state.cart.total = 5000;
    state.user.roles.push('billing');
    expect(view.cart.total).toBe(5000);
    expect(view.user.roles).toHaveLength(2);
  });

  it('non-mutating array methods, spread and for...of work', () => {
    const view = readonlyView(makeState());
    expect(view.cart.items.map((i) => i.sku)).toEqual(['A1']);
    expect(view.user.roles.filter(Boolean)).toEqual(['admin']);
    expect([...view.user.roles]).toEqual(['admin']);
    const seen = [];
    for (const r of view.user.roles) seen.push(r);
    expect(seen).toEqual(['admin']);
    expect(Array.isArray(view.user.roles)).toBe(true);
    expect(JSON.stringify(view.cart)).toBe('{"items":[{"sku":"A1","qty":1}],"total":1200}');
  });

  it('leaves Dates, Maps and class instances unwrapped so their methods work', () => {
    class Money { #cents = 5; get cents() { return this.#cents; } }
    const state = { ...makeState(), price: new Money() };
    const view = readonlyView(state);
    expect(view.createdAt.getTime()).toBe(0);
    expect(view.lookup.get('A1')).toBe('Widget');
    expect(view.price.cents).toBe(5);
    expect(view.createdAt).toBe(state.createdAt);
  });

  it('returns primitives and non-plain objects unchanged', () => {
    const d = new Date();
    expect(readonlyView(5)).toBe(5);
    expect(readonlyView('x')).toBe('x');
    expect(readonlyView(null)).toBe(null);
    expect(readonlyView(d)).toBe(d);
  });
});

describe('identity', () => {
  it('one view per target', () => {
    const state = makeState();
    expect(readonlyView(state)).toBe(readonlyView(state));
    const view = readonlyView(state);
    expect(view.cart).toBe(view.cart);
    expect(view.cart.items[0]).toBe(view.cart.items[0]);
  });

  it('a view of a view is the same view', () => {
    const view = readonlyView(makeState());
    expect(readonlyView(view)).toBe(view);
    expect(readonlyView(view.cart)).toBe(view.cart);
  });

  it('isReadonlyView recognises views only', () => {
    const state = makeState();
    const view = readonlyView(state);
    expect(isReadonlyView(view)).toBe(true);
    expect(isReadonlyView(view.cart.items)).toBe(true);
    expect(isReadonlyView(state)).toBe(false);
    expect(isReadonlyView(null)).toBe(false);
    expect(isReadonlyView(42)).toBe(false);
  });
});

describe('writes throw', () => {
  it('assignment throws a TypeError naming the property', () => {
    const state = makeState();
    const view = readonlyView(state);
    const e = thrownBy(() => { view.cart.total = 0; });
    expect(e).toBeInstanceOf(TypeError);
    expect(e.message).toContain('total');
    expect(state.cart.total).toBe(1200);
  });

  it('delete and defineProperty throw', () => {
    const state = makeState();
    const view = readonlyView(state);
    const del = thrownBy(() => { delete view.user.name; });
    expect(del).toBeInstanceOf(TypeError);
    expect(del.message).toContain('name');
    const def = thrownBy(() => Object.defineProperty(view.user, 'isAdmin', { value: true }));
    expect(def).toBeInstanceOf(TypeError);
    expect(def.message).toContain('isAdmin');
    expect(state.user).toEqual({ name: 'ada', roles: ['admin'] });
  });

  it('setPrototypeOf throws', () => {
    const view = readonlyView(makeState());
    expect(() => Object.setPrototypeOf(view.user, { evil: true })).toThrow(TypeError);
  });

  it('array mutators throw and leave the array unchanged', () => {
    const state = makeState();
    const view = readonlyView(state);
    expect(() => view.cart.items.push({ sku: 'FREE', qty: 1 })).toThrow(TypeError);
    expect(() => view.user.roles.splice(0, 1)).toThrow(TypeError);
    expect(() => { view.cart.items.length = 0; }).toThrow(TypeError);
    expect(state.cart.items).toHaveLength(1);
    expect(state.user.roles).toEqual(['admin']);
  });

  it('writes through a nested view throw at every depth', () => {
    const state = makeState();
    const view = readonlyView(state);
    expect(() => { view.cart.items[0].qty = 99; }).toThrow(TypeError);
    expect(state.cart.items[0].qty).toBe(1);
  });
});

describe('frozen targets', () => {
  it('does not trip the proxy invariant on frozen properties', () => {
    const inner = { a: 1 };
    const frozen = Object.freeze({ inner, n: 1 });
    const view = readonlyView(frozen);
    expect(view.n).toBe(1);
    expect(view.inner.a).toBe(1);
    expect(() => { view.n = 2; }).toThrow(TypeError);
  });
});
