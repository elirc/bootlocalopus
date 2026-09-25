const { createStore, shallowEqual, useStore } = solution;

describe('createStore', () => {
  it('merges partial updates and updater functions', () => {
    const store = createStore({ a: 1, b: 2 });
    store.setState({ a: 10 });
    expect(store.getState()).toEqual({ a: 10, b: 2 });
    store.setState((s) => ({ b: s.a + s.b }));
    expect(store.getState()).toEqual({ a: 10, b: 12 });
  });

  it('never mutates the previous state object', () => {
    const initial = { a: 1 };
    const store = createStore(initial);
    store.setState({ a: 2 });
    expect(initial).toEqual({ a: 1 });
    expect(store.getState()).not.toBe(initial);
  });

  it('notifies subscribers, and stops after unsubscribe', () => {
    const store = createStore({ n: 0 });
    let calls = 0;
    const off = store.subscribe(() => { calls++; });
    store.setState({ n: 1 });
    store.setState({ n: 2 });
    off();
    store.setState({ n: 3 });
    expect(calls).toBe(2);
  });

  it('keeps the same state and skips listeners when nothing changes', () => {
    const list = [1];
    const store = createStore({ n: 1, list });
    const before = store.getState();
    let calls = 0;
    store.subscribe(() => { calls++; });
    store.setState({ n: 1, list });
    store.setState((s) => ({ n: s.n }));
    store.setState({});
    expect(store.getState()).toBe(before);
    expect(calls).toBe(0);
  });

  it('survives a listener unsubscribing during notification', () => {
    const store = createStore({ n: 0 });
    const seen = [];
    let offB;
    store.subscribe(() => { seen.push('a'); offB(); });
    offB = store.subscribe(() => seen.push('b'));
    store.subscribe(() => seen.push('c'));
    store.setState({ n: 1 });
    store.setState({ n: 2 });
    expect(seen.filter((x) => x === 'c')).toHaveLength(2);
    expect(seen.filter((x) => x === 'a')).toHaveLength(2);
    expect(seen.filter((x) => x === 'b').length).toBeLessThanOrEqual(1);
  });
});

describe('shallowEqual', () => {
  it('compares arrays and plain objects one level deep', () => {
    const x = { id: 1 };
    expect(shallowEqual([1, x], [1, x])).toBe(true);
    expect(shallowEqual([1, x], [1, { id: 1 }])).toBe(false);
    expect(shallowEqual([1], [1, 2])).toBe(false);
    expect(shallowEqual({ a: 1, b: x }, { b: x, a: 1 })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual({ a: undefined }, { b: undefined })).toBe(false);
    expect(shallowEqual(NaN, NaN)).toBe(true);
    expect(shallowEqual([], {})).toBe(false);
    expect(shallowEqual(null, {})).toBe(false);
  });
});

describe('useStore', () => {
  const todos = [
    { id: 1, title: 'Write tests', done: false },
    { id: 2, title: 'Ship', done: true },
  ];

  it('re-renders only components whose slice changed', () => {
    const store = createStore({ user: 'Ada', count: 0 });
    const renders = { user: 0, count: 0 };
    function User() { renders.user++; return <p>user {useStore(store, (s) => s.user)}</p>; }
    function Count() { renders.count++; return <p>count {useStore(store, (s) => s.count)}</p>; }
    render(<div><User /><Count /></div>);
    act(() => store.setState({ count: 1 }));
    act(() => store.setState({ count: 2 }));
    expect(screen.getByText('count 2')).toBeTruthy();
    expect(renders).toEqual({ user: 1, count: 3 });
    act(() => store.setState({ user: 'Grace' }));
    expect(screen.getByText('user Grace')).toBeTruthy();
    expect(renders).toEqual({ user: 2, count: 3 });
  });

  it('returns the whole state by default', () => {
    const store = createStore({ a: 1 });
    const { result } = renderHook(() => useStore(store));
    expect(result.current).toBe(store.getState());
    act(() => store.setState({ a: 2 }));
    expect(result.current).toEqual({ a: 2 });
  });

  it('handles a selector that builds a new array, given shallowEqual', () => {
    const store = createStore({ todos, filter: 'all' });
    let renders = 0;
    const seen = [];
    function Open() {
      renders++;
      const open = useStore(store, (s) => s.todos.filter((t) => !t.done), shallowEqual);
      seen.push(open);
      return <ul>{open.map((t) => <li key={t.id}>{t.title}</li>)}</ul>;
    }
    render(<Open />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Write tests']);
    act(() => store.setState({ filter: 'done' }));
    expect(renders).toBe(1);
    act(() => store.setState((s) => ({ todos: [...s.todos, { id: 3, title: 'Celebrate', done: false }] })));
    expect(renders).toBe(2);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Write tests', 'Celebrate']);
  });

  it('returns the previous selection object while contents are equal', () => {
    const store = createStore({ todos, other: 0 });
    const { result, rerender } = renderHook(() => useStore(store, (s) => s.todos.map((t) => t.id), shallowEqual));
    const first = result.current;
    act(() => store.setState({ other: 1 }));
    rerender();
    expect(result.current).toBe(first);
    expect(first).toEqual([1, 2]);
  });

  it('uses a custom isEqual', () => {
    const store = createStore({ price: 10.01 });
    let renders = 0;
    function Price() {
      renders++;
      const p = useStore(store, (s) => s.price, (a, b) => Math.round(a) === Math.round(b));
      return <p>{Math.round(p)}</p>;
    }
    render(<Price />);
    act(() => store.setState({ price: 10.2 }));
    expect(renders).toBe(1);
    act(() => store.setState({ price: 11.7 }));
    expect(renders).toBe(2);
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('works when the selector depends on props', () => {
    const store = createStore({ names: { 1: 'Ada', 2: 'Grace' } });
    function Name({ id }) { return <p>{useStore(store, (s) => s.names[id])}</p>; }
    const { rerender } = render(<Name id={1} />);
    expect(screen.getByRole('paragraph').textContent).toBe('Ada');
    rerender(<Name id={2} />);
    expect(screen.getByRole('paragraph').textContent).toBe('Grace');
  });

  it('unsubscribes on unmount', () => {
    const store = createStore({ n: 0 });
    let live = 0;
    const realSubscribe = store.subscribe;
    store.subscribe = (fn) => { live++; const off = realSubscribe(fn); return () => { live--; off(); }; };
    const { unmount } = renderHook(() => useStore(store, (s) => s.n));
    expect(live).toBeGreaterThan(0);
    unmount();
    expect(live).toBe(0);
  });
});
