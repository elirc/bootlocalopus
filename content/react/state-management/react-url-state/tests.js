const { useSearchParam, ProductSearch } = solution;

let log;
const realPush = window.history.pushState;
const realReplace = window.history.replaceState;

beforeEach(() => {
  realReplace.call(window.history, null, '', '/products');
  log = [];
  window.history.pushState = function (...args) { log.push(['push', args[2]]); return realPush.apply(this, args); };
  window.history.replaceState = function (...args) { log.push(['replace', args[2]]); return realReplace.apply(this, args); };
});
afterEach(() => {
  cleanup();
  window.history.pushState = realPush;
  window.history.replaceState = realReplace;
});

// What the browser does on Back/Forward: the URL changes, then `popstate`.
const browserNavigatesTo = (url) => {
  realReplace.call(window.history, null, '', url);
  act(() => { window.dispatchEvent(new window.PopStateEvent('popstate', { state: null })); });
};
const params = () => Object.fromEntries(new URLSearchParams(window.location.search));

const products = [
  { id: 1, name: 'Desk lamp', category: 'lighting' },
  { id: 2, name: 'Oak desk', category: 'furniture' },
  { id: 3, name: 'Floor lamp', category: 'lighting' },
  { id: 4, name: 'Bookshelf', category: 'furniture' },
  { id: 5, name: 'Lamp shade', category: 'accessories' },
];
const names = () => screen.queryAllByRole('listitem').map((li) => li.textContent);
const search = () => screen.getByRole('searchbox', { name: 'Search' });
const category = () => screen.getByRole('combobox', { name: 'Category' });

describe('useSearchParam', () => {
  it('reads the parameter, or the default when absent', () => {
    realReplace.call(window.history, null, '', '/products?page=3');
    const page = renderHook(() => useSearchParam('page', '1'));
    const sort = renderHook(() => useSearchParam('sort', 'newest'));
    const q = renderHook(() => useSearchParam('q'));
    expect(page.result.current[0]).toBe('3');
    expect(sort.result.current[0]).toBe('newest');
    expect(q.result.current[0]).toBe('');
  });

  it('pushes by default and keeps the path and other parameters', () => {
    realReplace.call(window.history, null, '', '/products?utm_source=mail&q=desk');
    const { result } = renderHook(() => useSearchParam('sort', 'newest'));
    act(() => result.current[1]('price'));
    expect(result.current[0]).toBe('price');
    expect(window.location.pathname).toBe('/products');
    expect(params()).toEqual({ utm_source: 'mail', q: 'desk', sort: 'price' });
    expect(log.map((l) => l[0])).toEqual(['push']);
  });

  it('replaces when asked', () => {
    const { result } = renderHook(() => useSearchParam('q'));
    act(() => result.current[1]('l', { replace: true }));
    act(() => result.current[1]('la', { replace: true }));
    expect(params()).toEqual({ q: 'la' });
    expect(log.map((l) => l[0])).toEqual(['replace', 'replace']);
  });

  it('removes the parameter for an empty value or the default', () => {
    realReplace.call(window.history, null, '', '/products?q=desk&sort=price&x=1');
    const q = renderHook(() => useSearchParam('q'));
    const sort = renderHook(() => useSearchParam('sort', 'newest'));
    act(() => q.result.current[1](''));
    act(() => sort.result.current[1]('newest'));
    expect(params()).toEqual({ x: '1' });
    expect(sort.result.current[0]).toBe('newest');
  });

  it('does not add a history entry when the value is unchanged', () => {
    realReplace.call(window.history, null, '', '/products?sort=price');
    const { result } = renderHook(() => useSearchParam('sort', 'newest'));
    act(() => result.current[1]('price'));
    const other = renderHook(() => useSearchParam('q'));
    act(() => other.result.current[1](''));
    expect(log).toEqual([]);
  });

  it('encodes values safely', () => {
    const { result } = renderHook(() => useSearchParam('q'));
    act(() => result.current[1]('a&b=c d'));
    expect(result.current[0]).toBe('a&b=c d');
    expect(params()).toEqual({ q: 'a&b=c d' });
  });

  it('re-renders every reader when one writes', () => {
    function Reader() { const [v] = useSearchParam('tab', 'overview'); return <p>tab: {v}</p>; }
    function Writer() { const [, set] = useSearchParam('tab', 'overview'); return <button onClick={() => set('billing')}>billing</button>; }
    render(<div><Reader /><Writer /></div>);
    fireEvent.click(screen.getByRole('button', { name: 'billing' }));
    expect(screen.getByText('tab: billing')).toBeTruthy();
  });

  it('follows Back and Forward (popstate)', () => {
    const { result } = renderHook(() => useSearchParam('tab', 'overview'));
    browserNavigatesTo('/products?tab=history');
    expect(result.current[0]).toBe('history');
    browserNavigatesTo('/products');
    expect(result.current[0]).toBe('overview');
  });

  it('stops listening after unmount', () => {
    const realAdd = window.addEventListener;
    const realRemove = window.removeEventListener;
    const live = new Set();
    window.addEventListener = function (type, fn, o) { if (type === 'popstate') live.add(fn); return realAdd.call(this, type, fn, o); };
    window.removeEventListener = function (type, fn, o) { if (type === 'popstate') live.delete(fn); return realRemove.call(this, type, fn, o); };
    try {
      const { unmount } = renderHook(() => useSearchParam('q'));
      expect(live.size).toBeGreaterThan(0);
      unmount();
      expect(live.size).toBe(0);
    } finally {
      window.addEventListener = realAdd;
      window.removeEventListener = realRemove;
    }
  });
});

describe('ProductSearch', () => {
  it('renders from the URL it was opened with', () => {
    realReplace.call(window.history, null, '', '/products?q=LAMP&category=lighting');
    render(<ProductSearch products={products} />);
    expect(search().value).toBe('LAMP');
    expect(category().value).toBe('lighting');
    expect(names()).toEqual(['Desk lamp', 'Floor lamp']);
  });

  it('lists categories in first-seen order after all', () => {
    render(<ProductSearch products={products} />);
    expect([...category().options].map((o) => o.value)).toEqual(['all', 'lighting', 'furniture', 'accessories']);
    expect(names()).toHaveLength(5);
  });

  it('typing replaces the URL instead of piling up history', () => {
    render(<ProductSearch products={products} />);
    fireEvent.change(search(), { target: { value: 'd' } });
    fireEvent.change(search(), { target: { value: 'de' } });
    fireEvent.change(search(), { target: { value: 'desk' } });
    expect(names()).toEqual(['Desk lamp', 'Oak desk']);
    expect(params()).toEqual({ q: 'desk' });
    expect(log.every(([kind]) => kind === 'replace')).toBe(true);
    fireEvent.change(search(), { target: { value: '' } });
    expect(params()).toEqual({});
  });

  it('a category change is a history entry, and Back undoes it', () => {
    render(<ProductSearch products={products} />);
    fireEvent.change(search(), { target: { value: 'lamp' } });
    fireEvent.change(category(), { target: { value: 'accessories' } });
    expect(names()).toEqual(['Lamp shade']);
    expect(log[log.length - 1]).toEqual(['push', '/products?q=lamp&category=accessories']);

    browserNavigatesTo('/products?q=lamp');
    expect(category().value).toBe('all');
    expect(names()).toEqual(['Desk lamp', 'Floor lamp', 'Lamp shade']);
  });

  it('keeps all out of the URL', () => {
    realReplace.call(window.history, null, '', '/products?category=furniture');
    render(<ProductSearch products={products} />);
    fireEvent.change(category(), { target: { value: 'all' } });
    expect(params()).toEqual({});
    expect(names()).toHaveLength(5);
  });
});
