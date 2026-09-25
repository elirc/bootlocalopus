const Strict = ({ children }) => <React.StrictMode>{children}</React.StrictMode>;

describe('usePrevious', () => {
  it('is undefined on the first render', () => {
    const { result } = renderHook(() => solution.usePrevious(1));
    expect(result.current).toBeUndefined();
  });

  it('returns the value from the previous render', () => {
    const { result, rerender } = renderHook(({ v }) => solution.usePrevious(v), { initialProps: { v: 'a' } });
    rerender({ v: 'b' });
    expect(result.current).toBe('a');
    rerender({ v: 'c' });
    expect(result.current).toBe('b');
  });

  it('returns the previous render\'s value even when it did not change', () => {
    const { result, rerender } = renderHook(({ v }) => solution.usePrevious(v), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    rerender({ v: 2 });
    expect(result.current).toBe(2);
  });

  it('is correct under StrictMode (no ref writes during render)', () => {
    const { result, rerender } = renderHook(({ v }) => solution.usePrevious(v), {
      initialProps: { v: 'a' },
      wrapper: Strict,
    });
    expect(result.current).toBeUndefined();
    rerender({ v: 'b' });
    expect(result.current).toBe('a');
    rerender({ v: 'c' });
    expect(result.current).toBe('b');
  });
});

describe('useLatest', () => {
  it('returns the same ref object on every render', () => {
    const { result, rerender } = renderHook(({ v }) => solution.useLatest(v), { initialProps: { v: 1 } });
    const first = result.current;
    rerender({ v: 2 });
    rerender({ v: 3 });
    expect(result.current).toBe(first);
  });

  it('holds the latest committed value', () => {
    const { result, rerender } = renderHook(({ v }) => solution.useLatest(v), { initialProps: { v: 1 } });
    expect(result.current.current).toBe(1);
    rerender({ v: 2 });
    expect(result.current.current).toBe(2);
  });

  it('lets a callback captured on mount read a later value', () => {
    let captured;
    function Probe({ v }) {
      const latest = solution.useLatest(v);
      React.useEffect(() => {
        captured = () => latest.current;
      }, []);
      return null;
    }
    const { rerender } = render(<Probe v="first" />);
    rerender(<Probe v="second" />);
    expect(captured()).toBe('second');
  });

  it('is already up to date when a child\'s passive effect runs', () => {
    // Children's effects run before their parent's, so a parent that updates
    // the ref in useEffect is still stale when the child reads it.
    const seen = [];
    function Child({ latest }) {
      React.useEffect(() => {
        seen.push(latest.current);
      });
      return null;
    }
    function Parent({ v }) {
      const latest = solution.useLatest(v);
      return <Child latest={latest} />;
    }
    const { rerender } = render(<Parent v={1} />);
    rerender(<Parent v={2} />);
    expect(seen).toEqual([1, 2]);
  });
});

describe('PriceTicker', () => {
  const price = () => screen.getByTestId('price').textContent;
  const trend = () => screen.getByTestId('trend').textContent;

  it('shows the price and no trend at first', () => {
    render(<solution.PriceTicker price={10} />);
    expect(price()).toBe('10');
    expect(trend()).toBe('');
  });

  it('shows up and down as the price moves', () => {
    const { rerender } = render(<solution.PriceTicker price={10} />);
    rerender(<solution.PriceTicker price={12} />);
    expect(trend()).toBe('up');
    rerender(<solution.PriceTicker price={11} />);
    expect(trend()).toBe('down');
    expect(price()).toBe('11');
  });

  it('keeps the last trend when re-rendered with the same price', () => {
    const { rerender } = render(<solution.PriceTicker price={10} />);
    rerender(<solution.PriceTicker price={12} />);
    rerender(<solution.PriceTicker price={12} />);
    expect(trend()).toBe('up');
    rerender(<solution.PriceTicker price={12} />);
    expect(trend()).toBe('up');
  });

  it('works under StrictMode', () => {
    const { rerender } = render(<Strict><solution.PriceTicker price={5} /></Strict>);
    rerender(<Strict><solution.PriceTicker price={3} /></Strict>);
    expect(trend()).toBe('down');
    rerender(<Strict><solution.PriceTicker price={3} /></Strict>);
    expect(trend()).toBe('down');
  });
});
