const { parseState, toSearch, startListPage } = solution;

const DEFAULT = { q: '', tags: [], sort: 'relevance', page: 1 };

let cleanups = [];
afterEach(() => { for (const fn of cleanups.splice(0)) fn(); });

/** A controllable fetchPage. With `respectAbort`, an abort rejects like fetch. */
function setup(url, { respectAbort = true } = {}) {
  history.replaceState(null, '', url);
  const calls = [];
  const views = [];
  const fetchPage = (state, { signal }) => new Promise((resolve, reject) => {
    calls.push({ state, signal, resolve, reject });
    if (respectAbort) signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const page = startListPage({ fetchPage, render: (v) => views.push(v) });
  cleanups.push(() => page.stop());
  return { page, calls, views };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const waitForPop = () => new Promise((r) => window.addEventListener('popstate', () => setTimeout(r, 0), { once: true }));

describe('parseState', () => {
  it('parses a full query', () => {
    expect(parseState('?q=blue+mug&tag=b&tag=a&sort=price-asc&page=3'))
      .toEqual({ q: 'blue mug', tags: ['a', 'b'], sort: 'price-asc', page: 3 });
    expect(parseState('sort=newest')).toEqual({ ...DEFAULT, sort: 'newest' });
  });

  it('turns hostile input into a valid state', () => {
    expect(parseState('')).toEqual(DEFAULT);
    expect(parseState('?q=%20%20&tag=%20&tag=b&tag=a&tag=b%20&sort=hacked&page=-3')).toEqual({ ...DEFAULT, tags: ['a', 'b'] });
    for (const page of ['0', '1.5', 'abc', '2e3', '', ' 4']) expect(parseState(`?page=${page}`).page).toBe(1);
    expect(parseState('?page=12').page).toBe(12);
  });
});

describe('toSearch', () => {
  it('omits defaults and uses a fixed order', () => {
    expect(toSearch(DEFAULT)).toBe('');
    expect(toSearch({ q: 'blue mug', tags: ['a', 'b'], sort: 'newest', page: 2 })).toBe('?q=blue+mug&tag=a&tag=b&sort=newest&page=2');
    expect(toSearch({ ...DEFAULT, page: 4 })).toBe('?page=4');
    expect(toSearch({ ...DEFAULT, q: 'a&b=c' })).toBe('?q=a%26b%3Dc');
  });

  it('round-trips to a canonical form', () => {
    const messy = '?page=2&sort=bogus&tag=z&q=+hi+&tag=a';
    expect(toSearch(parseState(messy))).toBe('?q=hi&tag=a&tag=z&page=2');
  });
});

describe('start', () => {
  it('canonicalises a pasted URL without a new history entry, keeping the hash, then loads', () => {
    const before = history.length;
    const { calls, views, page } = setup('/products?tag=b&tag=a&tag=a&page=0&sort=bogus&q=+mug+#grid');
    expect(location.pathname + location.search + location.hash).toBe('/products?q=mug&tag=a&tag=b#grid');
    expect(history.length).toBe(before);
    expect(calls.map((c) => c.state)).toEqual([{ q: 'mug', tags: ['a', 'b'], sort: 'relevance', page: 1 }]);
    expect(views).toEqual([{ status: 'loading', state: { q: 'mug', tags: ['a', 'b'], sort: 'relevance', page: 1 }, items: [] }]);
    expect(page.getState()).toEqual({ q: 'mug', tags: ['a', 'b'], sort: 'relevance', page: 1 });
  });

  it('renders success with items and total', async () => {
    const { calls, views } = setup('/products?page=2');
    calls[0].resolve({ items: ['Mug'], total: 21 });
    await flush();
    expect(views[1]).toEqual({ status: 'success', state: { ...DEFAULT, page: 2 }, items: ['Mug'], total: 21 });
  });

  it('renders a failure', async () => {
    const { calls, views } = setup('/products');
    const boom = new Error('500');
    calls[0].reject(boom);
    await flush();
    expect(views[1]).toEqual({ status: 'error', state: DEFAULT, items: [], error: boom });
  });
});

describe('update', () => {
  it('pushes the canonical URL, drops the hash and keeps shown items while loading', async () => {
    const { page, calls, views } = setup('/products#top');
    calls[0].resolve({ items: ['A'], total: 1 });
    await flush();
    const before = history.length;
    page.update({ sort: 'newest' });
    expect(location.pathname + location.search + location.hash).toBe('/products?sort=newest');
    expect(history.length).toBe(before + 1);
    expect(calls[1].state).toEqual({ ...DEFAULT, sort: 'newest' });
    expect(views[2]).toEqual({ status: 'loading', state: { ...DEFAULT, sort: 'newest' }, items: ['A'] });
  });

  it('replaces instead of pushing on request', () => {
    const { page } = setup('/products');
    const before = history.length;
    page.update({ q: 'mu' }, { replace: true });
    page.update({ q: 'mug' }, { replace: true });
    expect(history.length).toBe(before);
    expect(location.search).toBe('?q=mug');
  });

  it('resets the page when a filter changes, but not for a page change', () => {
    const { page, calls } = setup('/products?q=mug&page=7');
    page.update({ tags: ['red'] });
    expect(location.search).toBe('?q=mug&tag=red');
    page.update({ page: 3 });
    expect(location.search).toBe('?q=mug&tag=red&page=3');
    page.update({ sort: 'price-desc', page: 2 });
    expect(location.search).toBe('?q=mug&tag=red&sort=price-desc&page=2');
    expect(calls.map((c) => c.state.page)).toEqual([7, 1, 3, 2]);
  });

  it('does nothing when the URL would not change', () => {
    const { page, calls } = setup('/products?q=mug&tag=a&tag=b&page=4');
    const before = history.length;
    page.update({ tags: ['b', 'a', 'a'] });
    page.update({ q: ' mug ' });
    page.update({ page: 4 });
    page.update({ sort: 'nonsense' });
    expect(history.length).toBe(before);
    expect(calls).toHaveLength(1);
    expect(location.search).toBe('?q=mug&tag=a&tag=b&page=4');
  });

  it('only renders the latest load, even if fetchPage ignores the signal', async () => {
    const { page, calls, views } = setup('/products', { respectAbort: false });
    page.update({ q: 'a' });
    page.update({ q: 'ab' });
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].signal.aborted).toBe(true);
    expect(calls[2].signal.aborted).toBe(false);
    calls[2].resolve({ items: ['AB'], total: 1 });
    await flush();
    calls[1].resolve({ items: ['A'], total: 9 });
    calls[0].reject(new Error('late'));
    await flush();
    const settled = views.filter((v) => v.status !== 'loading');
    expect(settled).toEqual([{ status: 'success', state: { ...DEFAULT, q: 'ab' }, items: ['AB'], total: 1 }]);
    expect(page.getState()).toEqual({ ...DEFAULT, q: 'ab' });
  });

  it('never renders an AbortError', async () => {
    const { page, views } = setup('/products');
    page.update({ q: 'a' });
    await flush();
    expect(views.some((v) => v.status === 'error')).toBe(false);
  });
});

describe('back and forward', () => {
  it('loads the state from the URL on popstate, without writing history', async () => {
    const { page, calls } = setup('/products');
    page.update({ q: 'mug' });
    page.update({ tags: ['red'] });
    const before = history.length;
    const popped = waitForPop();
    history.back();
    await popped;
    expect(location.search).toBe('?q=mug');
    expect(history.length).toBe(before);
    expect(calls[calls.length - 1].state).toEqual({ ...DEFAULT, q: 'mug' });
    expect(page.getState()).toEqual({ ...DEFAULT, q: 'mug' });
    expect(calls[1].signal.aborted).toBe(true);
  });

  it('ignores a popstate that does not change the state', async () => {
    const { page, calls } = setup('/products?q=mug');
    history.pushState(null, '', '/products?q=mug#reviews');
    const popped = waitForPop();
    history.back();
    await popped;
    expect(calls).toHaveLength(1);
  });

  it('stop() removes the listener and silences the in-flight request', async () => {
    const { page, calls, views } = setup('/products', { respectAbort: false });
    page.update({ q: 'mug' });
    page.stop();
    expect(calls[1].signal.aborted).toBe(true);
    const count = views.length;
    calls[1].resolve({ items: ['Mug'], total: 1 });
    const popped = waitForPop();
    history.back();
    await popped;
    expect(calls).toHaveLength(2);
    expect(views).toHaveLength(count);
  });
});
