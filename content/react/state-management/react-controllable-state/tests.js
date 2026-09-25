const { useControllableState, Accordion } = solution;

const items = [
  { id: 'ship', title: 'Shipping', content: 'Ships in 2 days' },
  { id: 'ret', title: 'Returns', content: '30-day returns' },
  { id: 'war', title: 'Warranty', content: 'Two years' },
];
const button = (title) => screen.getByRole('button', { name: title });
const expanded = () => screen.getAllByRole('button').map((b) => b.getAttribute('aria-expanded'));
const regions = () => screen.queryAllByRole('region').map((r) => r.textContent);

describe('useControllableState', () => {
  it('uncontrolled: starts at defaultValue, updates and reports', () => {
    const calls = [];
    const { result } = renderHook(() => useControllableState({ defaultValue: 1, onChange: (v) => calls.push(v) }));
    expect(result.current[0]).toBe(1);
    act(() => result.current[1](5));
    expect(result.current[0]).toBe(5);
    act(() => result.current[1]((n) => n * 2));
    expect(result.current[0]).toBe(10);
    expect(calls).toEqual([5, 10]);
  });

  it('uncontrolled: two updaters in one handler both apply', () => {
    const calls = [];
    const { result } = renderHook(() => useControllableState({ defaultValue: 0, onChange: (v) => calls.push(v) }));
    act(() => {
      result.current[1]((n) => n + 1);
      result.current[1]((n) => n + 1);
    });
    expect(result.current[0]).toBe(2);
    expect(calls).toEqual([1, 2]);
  });

  it('controlled: shows value and only asks the parent to change it', () => {
    const calls = [];
    const { result, rerender } = renderHook(
      ({ value }) => useControllableState({ value, defaultValue: 'ignored', onChange: (v) => calls.push(v) }),
      { initialProps: { value: 'a' } },
    );
    expect(result.current[0]).toBe('a');
    act(() => result.current[1]('b'));
    expect(calls).toEqual(['b']);
    expect(result.current[0]).toBe('a');
    rerender({ value: 'c' });
    expect(result.current[0]).toBe('c');
    act(() => result.current[1]((prev) => prev + '!'));
    expect(calls).toEqual(['b', 'c!']);
  });

  it('treats null as a controlled value', () => {
    const { result } = renderHook(() => useControllableState({ value: null, defaultValue: 'x' }));
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]('y'));
    expect(result.current[0]).toBeNull();
  });

  it('does not call onChange when the value would not change', () => {
    const calls = [];
    const { result } = renderHook(() => useControllableState({ defaultValue: 3, onChange: (v) => calls.push(v) }));
    act(() => result.current[1](3));
    act(() => result.current[1]((n) => n));
    expect(calls).toEqual([]);
    const controlled = renderHook(() => useControllableState({ value: 'same', onChange: (v) => calls.push(v) }));
    act(() => controlled.result.current[1]('same'));
    expect(calls).toEqual([]);
  });

  it('works without onChange', () => {
    const { result } = renderHook(() => useControllableState({ defaultValue: false }));
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });

  it('keeps setState stable and calls the latest onChange', () => {
    const calls = [];
    const { result, rerender } = renderHook(({ tag }) => useControllableState({ defaultValue: 0, onChange: (v) => calls.push(tag + v) }), {
      initialProps: { tag: 'old' },
    });
    const set = result.current[1];
    rerender({ tag: 'new' });
    expect(result.current[1]).toBe(set);
    act(() => set(1));
    expect(calls).toEqual(['new1']);
  });
});

describe('Accordion', () => {
  it('uncontrolled: opens one at a time and closes on a second click', () => {
    const calls = [];
    render(<Accordion items={items} onOpenChange={(id) => calls.push(id)} />);
    expect(expanded()).toEqual(['false', 'false', 'false']);
    expect(regions()).toEqual([]);
    fireEvent.click(button('Returns'));
    expect(expanded()).toEqual(['false', 'true', 'false']);
    expect(regions()).toEqual(['30-day returns']);
    fireEvent.click(button('Warranty'));
    expect(regions()).toEqual(['Two years']);
    fireEvent.click(button('Warranty'));
    expect(regions()).toEqual([]);
    expect(calls).toEqual(['ret', 'war', null]);
  });

  it('uncontrolled: honours defaultOpenId', () => {
    render(<Accordion items={items} defaultOpenId="ship" />);
    expect(regions()).toEqual(['Ships in 2 days']);
  });

  it('wires aria-controls to a labelled region', () => {
    render(<Accordion items={items} defaultOpenId="war" />);
    const region = screen.getByRole('region', { name: 'Warranty' });
    expect(button('Warranty').getAttribute('aria-controls')).toBe(region.id);
    expect(region.id).not.toBe('');
  });

  it('gives two accordions different panel ids', () => {
    render(
      <div>
        <Accordion items={[items[0]]} defaultOpenId="ship" />
        <Accordion items={[items[0]]} defaultOpenId="ship" />
      </div>,
    );
    const [a, b] = screen.getAllByRole('region');
    expect(a.id).not.toBe(b.id);
  });

  it('controlled: the parent decides, and can refuse', () => {
    const calls = [];
    render(<Accordion items={items} openId="ship" onOpenChange={(id) => calls.push(id)} />);
    fireEvent.click(button('Returns'));
    expect(calls).toEqual(['ret']);
    expect(regions()).toEqual(['Ships in 2 days']);
    fireEvent.click(button('Shipping'));
    expect(calls).toEqual(['ret', null]);
    expect(regions()).toEqual(['Ships in 2 days']);
  });

  it('controlled: follows the parent\'s state, including changes the parent makes itself', () => {
    function Host() {
      const [open, setOpen] = React.useState(null);
      return (
        <div>
          <button onClick={() => setOpen('war')}>Show warranty</button>
          <Accordion items={items} openId={open} onOpenChange={setOpen} />
          <p data-testid="open">{String(open)}</p>
        </div>
      );
    }
    render(<Host />);
    expect(regions()).toEqual([]);
    fireEvent.click(button('Shipping'));
    expect(regions()).toEqual(['Ships in 2 days']);
    fireEvent.click(button('Show warranty'));
    expect(regions()).toEqual(['Two years']);
    fireEvent.click(button('Warranty'));
    expect(regions()).toEqual([]);
    expect(screen.getByTestId('open').textContent).toBe('null');
  });
});
