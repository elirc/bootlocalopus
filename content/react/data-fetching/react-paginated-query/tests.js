const { usePagedData, OrdersTable } = solution;

function createPages() {
  const calls = [];
  const fetchPage = (page) => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    calls.push({ page, resolve, reject });
    return promise;
  };
  fetchPage.calls = calls;
  fetchPage.pages = () => calls.map((c) => c.page);
  fetchPage.last = (page) => [...calls].reverse().find((c) => c.page === page);
  return fetchPage;
}
const pageOf = (n, hasMore = true) => ({ items: [n * 10 + 1, n * 10 + 2].map((id) => ({ id: 'o' + id })), hasMore });
const settle = async (fn) => { await act(async () => { fn(); }); };

function setup(start = 1) {
  const fetchPage = createPages();
  const hook = renderHook(({ page }) => usePagedData(page, (p) => fetchPage(p)), { initialProps: { page: start } });
  return { ...hook, fetchPage, go: (page) => hook.rerender({ page }) };
}

describe('usePagedData', () => {
  it('loads the first page', async () => {
    const { result, fetchPage } = setup();
    expect(result.current).toEqual({ data: undefined, isPlaceholder: false, isFetching: true, error: null });
    await settle(() => fetchPage.calls[0].resolve(pageOf(1)));
    expect(result.current).toEqual({ data: pageOf(1), isPlaceholder: false, isFetching: false, error: null });
  });

  it('prefetches the next page only when there is one', async () => {
    const { fetchPage } = setup();
    await settle(() => fetchPage.calls[0].resolve(pageOf(1)));
    expect(fetchPage.pages()).toEqual([1, 2]);
    await settle(() => fetchPage.last(2).resolve(pageOf(2, false)));
    expect(fetchPage.pages()).toEqual([1, 2]);
  });

  it('shows a prefetched page instantly, without fetching it again', async () => {
    const { result, fetchPage, go } = setup();
    await settle(() => fetchPage.calls[0].resolve(pageOf(1)));
    await settle(() => fetchPage.last(2).resolve(pageOf(2)));
    go(2);
    expect(result.current).toMatchObject({ data: pageOf(2), isPlaceholder: false, isFetching: false });
    expect(fetchPage.pages().filter((p) => p === 2)).toHaveLength(1);
  });

  it('joins a prefetch that is still in flight instead of fetching twice', async () => {
    const { result, fetchPage, go } = setup();
    await settle(() => fetchPage.calls[0].resolve(pageOf(1)));
    go(2);
    expect(fetchPage.pages()).toEqual([1, 2]);
    expect(result.current).toMatchObject({ data: pageOf(1), isPlaceholder: true, isFetching: true });
    await settle(() => fetchPage.last(2).resolve(pageOf(2)));
    expect(result.current).toMatchObject({ data: pageOf(2), isPlaceholder: false });
  });

  it('keeps the previous page on screen while an uncached page loads', async () => {
    const { result, fetchPage, go } = setup();
    await settle(() => fetchPage.calls[0].resolve(pageOf(1)));
    go(7);
    expect(result.current).toEqual({ data: pageOf(1), isPlaceholder: true, isFetching: true, error: null });
    await settle(() => fetchPage.last(7).resolve(pageOf(7)));
    expect(result.current).toEqual({ data: pageOf(7), isPlaceholder: false, isFetching: false, error: null });
  });

  it('shows cached pages instantly when going back', async () => {
    const { result, fetchPage, go } = setup();
    await settle(() => fetchPage.calls[0].resolve(pageOf(1)));
    go(5);
    await settle(() => fetchPage.last(5).resolve(pageOf(5, false)));
    const before = fetchPage.calls.length;
    go(1);
    expect(result.current).toMatchObject({ data: pageOf(1), isPlaceholder: false, isFetching: false });
    go(5);
    expect(result.current.data).toEqual(pageOf(5, false));
    expect(fetchPage.calls.length).toBe(before);
  });

  it('never shows a page the user has moved past, but keeps it for later', async () => {
    const { result, fetchPage, go } = setup();
    await settle(() => fetchPage.calls[0].resolve(pageOf(1)));
    go(5);
    go(6);
    await settle(() => fetchPage.last(5).resolve(pageOf(5)));
    expect(result.current).toMatchObject({ data: pageOf(1), isPlaceholder: true });
    await settle(() => fetchPage.last(6).resolve(pageOf(6)));
    expect(result.current.data).toEqual(pageOf(6));
    const before = fetchPage.pages().filter((p) => p === 5).length;
    go(5);
    expect(result.current).toMatchObject({ data: pageOf(5), isPlaceholder: false });
    expect(fetchPage.pages().filter((p) => p === 5)).toHaveLength(before);
  });

  it('reports an error for the current page and keeps the old data', async () => {
    const { result, fetchPage, go } = setup();
    await settle(() => fetchPage.calls[0].resolve(pageOf(1)));
    go(4);
    const boom = new Error('500');
    await settle(() => fetchPage.last(4).reject(boom));
    expect(result.current).toEqual({ data: pageOf(1), isPlaceholder: true, isFetching: false, error: boom });
  });

  it('does not cache a failed prefetch', async () => {
    const { result, fetchPage, go } = setup();
    await settle(() => fetchPage.calls[0].resolve(pageOf(1)));
    await settle(() => fetchPage.last(2).reject(new Error('flaky')));
    go(2);
    expect(result.current.error).toBeNull();
    expect(fetchPage.pages()).toEqual([1, 2, 2]);
    await settle(() => fetchPage.last(2).resolve(pageOf(2)));
    expect(result.current.data).toEqual(pageOf(2));
  });
});

describe('OrdersTable', () => {
  const ids = () => screen.queryAllByRole('listitem').map((li) => li.textContent);
  const btn = (name) => screen.getByRole('button', { name });

  it('pages without flashing to a loading state', async () => {
    const fetchPage = createPages();
    render(<OrdersTable fetchPage={fetchPage} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(btn('Previous').disabled).toBe(true);
    expect(btn('Next').disabled).toBe(true);
    await settle(() => fetchPage.calls[0].resolve(pageOf(1)));
    expect(ids()).toEqual(['o11', 'o12']);
    expect(btn('Next').disabled).toBe(false);

    fireEvent.click(btn('Next'));
    expect(screen.getByText('Page 2')).toBeTruthy();
    expect(ids()).toEqual(['o11', 'o12']);
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(btn('Next').disabled).toBe(true);

    await settle(() => fetchPage.last(2).resolve(pageOf(2, false)));
    expect(ids()).toEqual(['o21', 'o22']);
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBe('false');
    expect(btn('Next').disabled).toBe(true);
    fireEvent.click(btn('Previous'));
    expect(ids()).toEqual(['o11', 'o12']);
  });

  it('shows an error for a page that fails', async () => {
    const fetchPage = createPages();
    render(<OrdersTable fetchPage={fetchPage} />);
    await settle(() => fetchPage.calls[0].resolve(pageOf(1)));
    fireEvent.click(btn('Next'));
    await settle(() => fetchPage.last(2).reject(new Error('500')));
    expect(screen.getByRole('alert').textContent).toBe('Could not load page 2');
  });
});
