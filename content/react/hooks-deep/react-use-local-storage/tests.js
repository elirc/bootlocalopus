const otherTabWrites = (key, value) => {
  // Another tab changed storage: the item changes, then the browser fires
  // `storage` in this tab.
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
  act(() => {
    window.dispatchEvent(new window.StorageEvent('storage', { key, newValue: value }));
  });
};

function Reader({ name, storageKey = 'theme', initial = 'light' }) {
  const [value] = solution.useLocalStorage(storageKey, initial);
  return <output aria-label={name}>{JSON.stringify(value)}</output>;
}
const shown = (name) => screen.getByLabelText(name).textContent;

beforeEach(() => window.localStorage.clear());

describe('useLocalStorage', () => {
  it('returns initialValue when the key is missing', () => {
    const { result } = renderHook(() => solution.useLocalStorage('missing', 42));
    expect(result.current[0]).toBe(42);
  });

  it('reads and parses an existing value', () => {
    window.localStorage.setItem('prefs', JSON.stringify({ compact: true }));
    const { result } = renderHook(() => solution.useLocalStorage('prefs', {}));
    expect(result.current[0]).toEqual({ compact: true });
  });

  it('falls back to initialValue on invalid JSON', () => {
    window.localStorage.setItem('broken', '{not json');
    const { result } = renderHook(() => solution.useLocalStorage('broken', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });

  it('writes JSON and re-renders with the new value', () => {
    const { result } = renderHook(() => solution.useLocalStorage('count', 0));
    act(() => result.current[1](5));
    expect(result.current[0]).toBe(5);
    expect(window.localStorage.getItem('count')).toBe('5');
    act(() => result.current[1]({ a: [1, 2] }));
    expect(window.localStorage.getItem('count')).toBe('{"a":[1,2]}');
  });

  it('applies two updater calls in a row', () => {
    const { result } = renderHook(() => solution.useLocalStorage('count', 0));
    act(() => {
      result.current[1]((n) => n + 1);
      result.current[1]((n) => n + 1);
    });
    expect(result.current[0]).toBe(2);
    expect(window.localStorage.getItem('count')).toBe('2');
  });

  it('keeps every reader of the same key in sync', () => {
    function Writer() {
      const [, setTheme] = solution.useLocalStorage('theme', 'light');
      return <button onClick={() => setTheme('dark')}>dark</button>;
    }
    render(
      <div>
        <Reader name="a" />
        <Reader name="b" />
        <Reader name="other" storageKey="lang" initial="en" />
        <Writer />
      </div>,
    );
    expect(shown('a')).toBe('"light"');
    fireEvent.click(screen.getByRole('button', { name: 'dark' }));
    expect(shown('a')).toBe('"dark"');
    expect(shown('b')).toBe('"dark"');
    expect(shown('other')).toBe('"en"');
  });

  it('picks up changes made in another tab', () => {
    render(<Reader name="a" />);
    otherTabWrites('theme', '"sepia"');
    expect(shown('a')).toBe('"sepia"');
    otherTabWrites('theme', null);
    expect(shown('a')).toBe('"light"');
  });

  it('remove() deletes the key and falls back to initialValue', () => {
    window.localStorage.setItem('theme', '"dark"');
    function Remover() {
      const [, , remove] = solution.useLocalStorage('theme', 'light');
      return <button onClick={remove}>reset</button>;
    }
    render(<div><Reader name="a" /><Remover /></div>);
    expect(shown('a')).toBe('"dark"');
    fireEvent.click(screen.getByRole('button', { name: 'reset' }));
    expect(shown('a')).toBe('"light"');
    expect(window.localStorage.getItem('theme')).toBeNull();
  });

  it('keeps the value\'s identity across re-renders', () => {
    window.localStorage.setItem('prefs', JSON.stringify({ compact: true }));
    const { result, rerender } = renderHook(() => solution.useLocalStorage('prefs', {}));
    const first = result.current[0];
    rerender();
    rerender();
    expect(result.current[0]).toBe(first);
  });

  it('keeps a missing key\'s initial object stable when passed inline', () => {
    const { result, rerender } = renderHook(() => solution.useLocalStorage('nothing', { items: [] }));
    const first = result.current[0];
    rerender();
    expect(result.current[0]).toBe(first);
  });

  it('returns stable setValue and remove', () => {
    const { result } = renderHook(() => solution.useLocalStorage('count', 0));
    const [, set, remove] = result.current;
    act(() => set(3));
    expect(result.current[1]).toBe(set);
    expect(result.current[2]).toBe(remove);
  });

  it('removes its storage listener on unmount', () => {
    let live = 0;
    const realAdd = window.addEventListener;
    const realRemove = window.removeEventListener;
    const tracked = new Set();
    window.addEventListener = function (type, fn, opts) {
      if (type === 'storage' && !tracked.has(fn)) { tracked.add(fn); live++; }
      return realAdd.call(this, type, fn, opts);
    };
    window.removeEventListener = function (type, fn, opts) {
      if (type === 'storage' && tracked.delete(fn)) live--;
      return realRemove.call(this, type, fn, opts);
    };
    try {
      const { unmount } = render(<Reader name="a" />);
      expect(live).toBeGreaterThan(0);
      unmount();
      expect(live).toBe(0);
    } finally {
      window.addEventListener = realAdd;
      window.removeEventListener = realRemove;
    }
  });
});
