const { createStore } = solution;
const shallowArrayEqual = (a, b) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

describe('setState', () => {
  it('merges a partial and applies an updater function', () => {
    const store = createStore({ count: 0, user: null });
    store.setState({ count: 1 });
    expect(store.getState()).toEqual({ count: 1, user: null });
    store.setState((s) => ({ ...s, count: s.count + 10 }));
    expect(store.getState()).toEqual({ count: 11, user: null });
  });
  it('does not mutate the previous state object', () => {
    const initial = { count: 0 };
    const store = createStore(initial);
    store.setState({ count: 5 });
    expect(initial).toEqual({ count: 0 });
    expect(store.getState()).not.toBe(initial);
  });
  it('keeps identity and stays silent when nothing changed', () => {
    const store = createStore({ count: 1, tag: 'a' });
    const before = store.getState();
    const calls = [];
    store.subscribe((s) => calls.push(s));
    store.setState({ count: 1 });
    store.setState({ count: 1, tag: 'a' });
    store.setState((s) => s);
    expect(store.getState()).toBe(before);
    expect(calls).toHaveLength(0);
  });
  it('treats NaN as equal to NaN (Object.is)', () => {
    const store = createStore({ v: NaN });
    const calls = [];
    store.subscribe(() => calls.push(1));
    store.setState({ v: NaN });
    expect(calls).toHaveLength(0);
  });
});

describe('subscribe', () => {
  it('passes the new and previous state, in subscription order', () => {
    const store = createStore({ n: 0 });
    const log = [];
    store.subscribe((s, p) => log.push(['a', s.n, p.n]));
    store.subscribe((s, p) => log.push(['b', s.n, p.n]));
    store.setState({ n: 1 });
    store.setState({ n: 2 });
    expect(log).toEqual([['a', 1, 0], ['b', 1, 0], ['a', 2, 1], ['b', 2, 1]]);
  });
  it('unsubscribes, and a second unsubscribe is harmless', () => {
    const store = createStore({ n: 0 });
    const a = [];
    const b = [];
    const offA = store.subscribe((s) => a.push(s.n));
    store.subscribe((s) => b.push(s.n));
    store.setState({ n: 1 });
    offA();
    offA();
    store.setState({ n: 2 });
    expect(a).toEqual([1]);
    expect(b).toEqual([1, 2]);
  });
  it('the same function subscribed twice is two subscriptions', () => {
    const store = createStore({ n: 0 });
    const calls = [];
    const fn = (s) => calls.push(s.n);
    const off1 = store.subscribe(fn);
    store.subscribe(fn);
    store.setState({ n: 1 });
    off1();
    store.setState({ n: 2 });
    expect(calls).toEqual([1, 1, 2]);
  });
});

describe('select', () => {
  it('only fires when its slice changes', () => {
    const store = createStore({ user: { name: 'Ada' }, count: 0 });
    const calls = [];
    store.select((s) => s.count, (next, prev) => calls.push([next, prev]));
    store.setState({ user: { name: 'Grace' } });
    store.setState({ count: 1 });
    store.setState({ user: { name: 'Linus' } });
    store.setState({ count: 5 });
    expect(calls).toEqual([[1, 0], [5, 1]]);
  });
  it('uses a custom equality for derived arrays', () => {
    const store = createStore({ todos: [{ id: 1, done: false }, { id: 2, done: true }], filter: 'all' });
    const naive = [];
    const smart = [];
    const doneIds = (s) => s.todos.filter((t) => t.done).map((t) => t.id);
    store.select(doneIds, (ids) => naive.push(ids));
    store.select(doneIds, (ids, prev) => smart.push([ids, prev]), shallowArrayEqual);
    store.setState({ filter: 'active' });
    store.setState({ filter: 'done' });
    store.setState((s) => ({ ...s, todos: s.todos.map((t) => ({ ...t, done: true })) }));
    expect(naive).toHaveLength(3);
    expect(smart).toEqual([[[1, 2], [2]]]);
  });
  it('compares against the last value it reported, not the value at subscribe time', () => {
    const store = createStore({ n: 0 });
    const calls = [];
    store.select((s) => s.n > 2, (big, was) => calls.push([big, was]));
    for (let i = 1; i <= 6; i++) store.setState({ n: i });
    store.setState({ n: 0 });
    expect(calls).toEqual([[true, false], [false, true]]);
  });
  it('can be unsubscribed', () => {
    const store = createStore({ n: 0 });
    const calls = [];
    const off = store.select((s) => s.n, (n) => calls.push(n));
    store.setState({ n: 1 });
    off();
    store.setState({ n: 2 });
    expect(calls).toEqual([1]);
  });
});

describe('batch', () => {
  it('notifies once with the pre-batch previous state', () => {
    const store = createStore({ a: 0, b: 0 });
    const calls = [];
    store.subscribe((s, p) => calls.push([s, p]));
    const result = store.batch(() => {
      store.setState({ a: 1 });
      expect(store.getState().a).toBe(1);
      store.setState({ b: 2 });
      store.setState((s) => ({ ...s, a: s.a + 1 }));
      return 'done';
    });
    expect(result).toBe('done');
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({ a: 2, b: 2 });
    expect(calls[0][1]).toEqual({ a: 0, b: 0 });
  });
  it('nested batches notify once, at the end of the outermost', () => {
    const store = createStore({ n: 0 });
    const calls = [];
    store.subscribe((s) => calls.push(s.n));
    store.batch(() => {
      store.setState({ n: 1 });
      store.batch(() => { store.setState({ n: 2 }); });
      expect(calls).toEqual([]);
      store.setState({ n: 3 });
    });
    expect(calls).toEqual([3]);
  });
  it('a batch that changes nothing notifies nobody', () => {
    const store = createStore({ n: 0 });
    const calls = [];
    store.subscribe((s) => calls.push(s.n));
    store.batch(() => { store.setState({ n: 0 }); store.setState((s) => s); });
    expect(calls).toEqual([]);
  });
  it('select listeners see only the net change of a batch', () => {
    const store = createStore({ n: 0 });
    const calls = [];
    store.select((s) => s.n, (n, p) => calls.push([n, p]));
    store.batch(() => { store.setState({ n: 1 }); store.setState({ n: 0 }); });
    expect(calls).toEqual([]);
    store.batch(() => { store.setState({ n: 4 }); store.setState({ n: 7 }); });
    expect(calls).toEqual([[7, 0]]);
  });
  it('notifies for completed changes, then rethrows', () => {
    const store = createStore({ n: 0 });
    const calls = [];
    store.subscribe((s) => calls.push(s.n));
    expect(() => store.batch(() => { store.setState({ n: 9 }); throw new Error('boom'); })).toThrow('boom');
    expect(calls).toEqual([9]);
    store.setState({ n: 10 });
    expect(calls).toEqual([9, 10]);
  });
});

describe('subscription changes during a notification round', () => {
  it('a listener unsubscribed before its turn is not called', () => {
    const store = createStore({ n: 0 });
    const calls = [];
    let offB;
    store.subscribe(() => { calls.push('a'); offB(); });
    offB = store.subscribe(() => calls.push('b'));
    store.setState({ n: 1 });
    expect(calls).toEqual(['a']);
  });
  it('a listener subscribed during a round waits for the next change', () => {
    const store = createStore({ n: 0 });
    const calls = [];
    let added = false;
    store.subscribe((s) => {
      calls.push('a' + s.n);
      if (!added) { added = true; store.subscribe((t) => calls.push('late' + t.n)); }
    });
    store.setState({ n: 1 });
    expect(calls).toEqual(['a1']);
    store.setState({ n: 2 });
    expect(calls).toEqual(['a1', 'a2', 'late2']);
  });
  it('a listener that unsubscribes itself still lets the others run', () => {
    const store = createStore({ n: 0 });
    const calls = [];
    const off = store.subscribe(() => { calls.push('a'); off(); });
    store.subscribe(() => calls.push('b'));
    store.setState({ n: 1 });
    store.setState({ n: 2 });
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});
