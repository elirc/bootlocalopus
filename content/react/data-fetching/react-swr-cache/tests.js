const { createCache, useCachedQuery, CustomerPanel } = solution;

// Every call gets its own deferred; tests settle them in any order.
function createFetcher() {
  const calls = [];
  const fetcher = (key) => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    calls.push({ key, resolve, reject });
    return promise;
  };
  fetcher.calls = calls;
  fetcher.keys = () => calls.map((c) => c.key);
  fetcher.last = (key) => [...calls].reverse().find((c) => c.key === key);
  return fetcher;
}
const settle = async (fn) => { await act(async () => { fn(); }); };

function setup(key = 'a', cache = createCache()) {
  const fetcher = createFetcher();
  const commits = [];
  const hook = renderHook(({ k }) => {
    const r = useCachedQuery(cache, k, (x) => fetcher(x));
    React.useLayoutEffect(() => { commits.push({ key: k, ...r }); });
    return r;
  }, { initialProps: { k: key } });
  return { ...hook, fetcher, cache, commits, show: (k) => hook.rerender({ k }) };
}

describe('createCache', () => {
  it('returns a fresh Map each time', () => {
    const a = createCache();
    expect(a instanceof Map).toBe(true);
    expect(a.size).toBe(0);
    expect(createCache()).not.toBe(a);
  });
});

describe('useCachedQuery', () => {
  it('loads when nothing is cached, then stores the result', async () => {
    const { result, fetcher, cache } = setup('a');
    expect(result.current).toEqual({ status: 'loading', data: undefined, error: null, isFetching: true });
    expect(fetcher.keys()).toEqual(['a']);
    await settle(() => fetcher.calls[0].resolve({ name: 'Ada' }));
    expect(result.current).toEqual({ status: 'success', data: { name: 'Ada' }, error: null, isFetching: false });
    expect(cache.get('a')).toEqual({ name: 'Ada' });
  });

  it('shows cached data on the first render and revalidates in the background', async () => {
    const cache = createCache();
    cache.set('a', { name: 'Old Ada' });
    const { result, fetcher, commits } = setup('a', cache);
    expect(commits[0]).toMatchObject({ status: 'success', data: { name: 'Old Ada' }, isFetching: true });
    expect(fetcher.keys()).toEqual(['a']);
    await settle(() => fetcher.calls[0].resolve({ name: 'New Ada' }));
    expect(result.current).toMatchObject({ status: 'success', data: { name: 'New Ada' }, isFetching: false });
    expect(cache.get('a')).toEqual({ name: 'New Ada' });
  });

  it('never commits the previous key\'s data for a new key', async () => {
    const { fetcher, commits, show } = setup('a');
    await settle(() => fetcher.calls[0].resolve('A data'));
    show('b');
    expect(fetcher.keys()).toEqual(['a', 'b']);
    const forB = commits.filter((c) => c.key === 'b');
    expect(forB.length).toBeGreaterThan(0);
    for (const c of forB) {
      expect(c.data).toBeUndefined();
      expect(c.status).toBe('loading');
    }
  });

  it('switches back to a cached key instantly', async () => {
    const { result, fetcher, commits, show } = setup('a');
    await settle(() => fetcher.calls[0].resolve('A data'));
    show('b');
    await settle(() => fetcher.last('b').resolve('B data'));
    show('a');
    const firstForA = commits.filter((c) => c.key === 'a').pop();
    expect(firstForA).toMatchObject({ status: 'success', data: 'A data', isFetching: true });
    expect(result.current.data).toBe('A data');
  });

  it('ignores a late response for the old key in the view, but caches it', async () => {
    const { result, fetcher, cache, show } = setup('a');
    show('b');
    await settle(() => fetcher.last('b').resolve('B data'));
    await settle(() => fetcher.calls[0].resolve('A late'));
    expect(result.current.data).toBe('B data');
    expect(cache.get('a')).toBe('A late');
    show('a');
    expect(result.current).toMatchObject({ status: 'success', data: 'A late', isFetching: true });
  });

  it('keeps data on screen when a background refresh fails', async () => {
    const cache = createCache();
    cache.set('a', 'cached');
    const { result, fetcher } = setup('a', cache);
    const boom = new Error('offline');
    await settle(() => fetcher.calls[0].reject(boom));
    expect(result.current).toEqual({ status: 'success', data: 'cached', error: boom, isFetching: false });
  });

  it('reports an error when there is nothing to show', async () => {
    const { result, fetcher } = setup('a');
    const boom = new Error('offline');
    await settle(() => fetcher.calls[0].reject(boom));
    expect(result.current).toEqual({ status: 'error', data: undefined, error: boom, isFetching: false });
  });

  it('ignores a late failure for the old key', async () => {
    const { result, fetcher, show } = setup('a');
    show('b');
    await settle(() => fetcher.calls[0].reject(new Error('old')));
    expect(result.current).toEqual({ status: 'loading', data: undefined, error: null, isFetching: true });
  });

  it('clears the error when the key changes', async () => {
    const cache = createCache();
    cache.set('b', 'B cached');
    const { result, fetcher, show } = setup('a', cache);
    await settle(() => fetcher.calls[0].reject(new Error('offline')));
    show('b');
    expect(result.current).toMatchObject({ status: 'success', data: 'B cached', error: null });
  });

  it('does not refetch when only the fetcher identity changes', () => {
    const { fetcher, rerender } = setup('a');
    rerender({ k: 'a' });
    rerender({ k: 'a' });
    expect(fetcher.keys()).toEqual(['a']);
  });
});

describe('CustomerPanel', () => {
  it('loads, then shows the name, then refreshes quietly', async () => {
    const cache = createCache();
    const fetchCustomer = createFetcher();
    const { rerender } = render(<CustomerPanel cache={cache} id="1" fetchCustomer={fetchCustomer} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    await settle(() => fetchCustomer.calls[0].resolve({ name: 'Ada' }));
    expect(screen.getByRole('heading').textContent).toBe('Ada');
    expect(screen.queryByText('Refreshing…')).toBeNull();

    rerender(<CustomerPanel cache={cache} id="2" fetchCustomer={fetchCustomer} />);
    await settle(() => fetchCustomer.last('2').resolve({ name: 'Grace' }));
    rerender(<CustomerPanel cache={cache} id="1" fetchCustomer={fetchCustomer} />);
    expect(screen.getByRole('heading').textContent).toBe('Ada');
    expect(screen.getByText('Refreshing…')).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('shows an error when the first load fails', async () => {
    const fetchCustomer = createFetcher();
    render(<CustomerPanel cache={createCache()} id="1" fetchCustomer={fetchCustomer} />);
    await settle(() => fetchCustomer.calls[0].reject(new Error('500')));
    expect(screen.getByRole('alert').textContent).toBe('Could not load customer');
  });
});
