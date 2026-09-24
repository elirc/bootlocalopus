const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('useToggle', () => {
  it('starts false by default and flips', () => {
    const { result } = renderHook(() => solution.useToggle());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
  });

  it('accepts an initial value', () => {
    const { result } = renderHook(() => solution.useToggle(true));
    expect(result.current[0]).toBe(true);
  });

  it('exposes a setter for forcing a value', () => {
    const { result } = renderHook(() => solution.useToggle());
    act(() => result.current[2](true));
    expect(result.current[0]).toBe(true);
  });

  it('keeps toggle referentially stable across renders', () => {
    const { result, rerender } = renderHook(() => solution.useToggle());
    const first = result.current[1];
    act(() => result.current[1]());
    rerender();
    expect(result.current[1]).toBe(first);
  });
});

describe('useCounter', () => {
  it('counts up and down from a start value', () => {
    const { result } = renderHook(() => solution.useCounter(5));
    expect(result.current.count).toBe(5);
    act(() => result.current.inc());
    expect(result.current.count).toBe(6);
    act(() => result.current.dec());
    act(() => result.current.dec());
    expect(result.current.count).toBe(4);
  });

  it('defaults to 0', () => {
    const { result } = renderHook(() => solution.useCounter());
    expect(result.current.count).toBe(0);
  });

  it('clamps to max', () => {
    const { result } = renderHook(() => solution.useCounter(0, { max: 2 }));
    act(() => result.current.inc());
    act(() => result.current.inc());
    act(() => result.current.inc());
    act(() => result.current.inc());
    expect(result.current.count).toBe(2);
  });

  it('clamps to min', () => {
    const { result } = renderHook(() => solution.useCounter(1, { min: 0 }));
    act(() => result.current.dec());
    act(() => result.current.dec());
    expect(result.current.count).toBe(0);
  });

  it('resets to the start value', () => {
    const { result } = renderHook(() => solution.useCounter(3));
    act(() => result.current.inc());
    act(() => result.current.reset());
    expect(result.current.count).toBe(3);
  });

  it('keeps its callbacks stable when only the count changes', () => {
    const { result } = renderHook(() => solution.useCounter(0));
    const { inc, dec, reset } = result.current;
    act(() => result.current.inc());
    expect(result.current.inc).toBe(inc);
    expect(result.current.dec).toBe(dec);
    expect(result.current.reset).toBe(reset);
  });
});

describe('useDebouncedValue', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => solution.useDebouncedValue('first', 20));
    expect(result.current).toBe('first');
  });

  it('waits for the delay before reporting a change', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => solution.useDebouncedValue(value, 40),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'b' });
    expect(result.current).toBe('a');
    await waitFor(() => expect(result.current).toBe('b'));
  });

  it('only reports the last value in a burst', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => solution.useDebouncedValue(value, 40),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'b' });
    rerender({ value: 'c' });
    rerender({ value: 'd' });
    expect(result.current).toBe('a');
    await waitFor(() => expect(result.current).toBe('d'));
    await sleep(60);
    expect(result.current).toBe('d');
  });

  // React 18 no longer warns about setState after unmount, so a missing
  // cleanup is invisible in the logs. Count the hook's pending timers instead
  // (it is the only thing here using a 777 ms delay).
  const trackTimers = () => {
    const pending = new Set();
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    globalThis.setTimeout = (fn, ms, ...rest) => {
      const id = realSet(() => { pending.delete(id); fn(...rest); }, ms);
      if (ms === 777) pending.add(id);
      return id;
    };
    globalThis.clearTimeout = (id) => { pending.delete(id); return realClear(id); };
    return { pending, restore: () => { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; } };
  };

  it('clears the previous timer when the value changes', () => {
    const timers = trackTimers();
    try {
      const { rerender, unmount } = renderHook(
        ({ value }) => solution.useDebouncedValue(value, 777),
        { initialProps: { value: 'a' } },
      );
      rerender({ value: 'b' });
      rerender({ value: 'c' });
      expect(timers.pending.size).toBe(1);
      unmount();
    } finally {
      timers.restore();
    }
  });

  it('clears its pending timer on unmount', () => {
    const timers = trackTimers();
    try {
      const { rerender, unmount } = renderHook(
        ({ value }) => solution.useDebouncedValue(value, 777),
        { initialProps: { value: 'a' } },
      );
      rerender({ value: 'b' });
      expect(timers.pending.size).toBeGreaterThan(0);
      unmount();
      expect(timers.pending.size).toBe(0);
    } finally {
      timers.restore();
    }
  });
});