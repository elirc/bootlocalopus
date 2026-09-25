const { useInfiniteList, Feed } = solution;

function createPages() {
  const calls = [];
  const fetchPage = (cursor) => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    calls.push({ cursor, resolve, reject });
    return promise;
  };
  fetchPage.calls = calls;
  fetchPage.cursors = () => calls.map((c) => c.cursor);
  fetchPage.last = () => calls[calls.length - 1];
  return fetchPage;
}
const page = (ids, nextCursor) => ({ items: ids.map((id) => ({ id, title: 'Post ' + id })), nextCursor });
const settle = async (fn) => { await act(async () => { fn(); }); };

function setup() {
  const fetchPage = createPages();
  const hook = renderHook(() => useInfiniteList((c) => fetchPage(c)));
  const ids = () => hook.result.current.items.map((i) => i.id);
  return { ...hook, fetchPage, ids };
}

describe('useInfiniteList', () => {
  it('loads the first page on mount', async () => {
    const { result, fetchPage, ids } = setup();
    expect(fetchPage.cursors()).toEqual([null]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.hasMore).toBe(true);
    await settle(() => fetchPage.calls[0].resolve(page([1, 2], 'c2')));
    expect(ids()).toEqual([1, 2]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('appends pages using the cursor, and stops at the end', async () => {
    const { result, fetchPage, ids } = setup();
    await settle(() => fetchPage.calls[0].resolve(page([1, 2], 'c2')));
    act(() => result.current.loadMore());
    expect(result.current.isLoading).toBe(true);
    await settle(() => fetchPage.last().resolve(page([3, 4], 'c3')));
    act(() => result.current.loadMore());
    await settle(() => fetchPage.last().resolve(page([5], null)));
    expect(ids()).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage.cursors()).toEqual([null, 'c2', 'c3']);
    expect(result.current.hasMore).toBe(false);
    act(() => result.current.loadMore());
    expect(fetchPage.calls).toHaveLength(3);
  });

  it('makes one request for two loadMore calls in one handler', async () => {
    const { result, fetchPage } = setup();
    await settle(() => fetchPage.calls[0].resolve(page([1], 'c2')));
    act(() => { result.current.loadMore(); result.current.loadMore(); });
    act(() => result.current.loadMore());
    expect(fetchPage.cursors()).toEqual([null, 'c2']);
  });

  it('does not load more while the first page is in flight', () => {
    const { result, fetchPage } = setup();
    act(() => result.current.loadMore());
    expect(fetchPage.calls).toHaveLength(1);
  });

  it('skips items that were already loaded', async () => {
    const { result, fetchPage, ids } = setup();
    await settle(() => fetchPage.calls[0].resolve(page([1, 2, 3], 'c2')));
    act(() => result.current.loadMore());
    await settle(() => fetchPage.last().resolve(page([3, 4, 5], null)));
    expect(ids()).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps loaded pages on error and retries the same cursor', async () => {
    const { result, fetchPage, ids } = setup();
    await settle(() => fetchPage.calls[0].resolve(page([1, 2], 'c2')));
    act(() => result.current.loadMore());
    const boom = new Error('503');
    await settle(() => fetchPage.last().reject(boom));
    expect(result.current.error).toBe(boom);
    expect(ids()).toEqual([1, 2]);
    expect(result.current.isLoading).toBe(false);

    act(() => result.current.loadMore());
    expect(fetchPage.calls).toHaveLength(2);

    act(() => result.current.retry());
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(fetchPage.cursors()).toEqual([null, 'c2', 'c2']);
    await settle(() => fetchPage.last().resolve(page([3], null)));
    expect(ids()).toEqual([1, 2, 3]);
  });

  it('retries a failed first page', async () => {
    const { result, fetchPage, ids } = setup();
    await settle(() => fetchPage.calls[0].reject(new Error('offline')));
    act(() => result.current.retry());
    act(() => result.current.retry());
    expect(fetchPage.cursors()).toEqual([null, null]);
    await settle(() => fetchPage.last().resolve(page([1], null)));
    expect(ids()).toEqual([1]);
  });

  it('retry does nothing without an error', async () => {
    const { result, fetchPage } = setup();
    await settle(() => fetchPage.calls[0].resolve(page([1], 'c2')));
    act(() => result.current.retry());
    expect(fetchPage.calls).toHaveLength(1);
  });

  it('keeps loadMore and retry stable', async () => {
    const { result, fetchPage } = setup();
    const { loadMore, retry } = result.current;
    await settle(() => fetchPage.calls[0].resolve(page([1], 'c2')));
    expect(result.current.loadMore).toBe(loadMore);
    expect(result.current.retry).toBe(retry);
  });

  it('requests the first page once under StrictMode', async () => {
    const fetchPage = createPages();
    const { result } = renderHook(() => useInfiniteList(fetchPage), {
      wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode>,
    });
    expect(fetchPage.calls).toHaveLength(1);
    await settle(() => fetchPage.calls[0].resolve(page([1], null)));
    expect(result.current.items).toHaveLength(1);
  });
});

describe('Feed', () => {
  const titles = () => screen.queryAllByRole('listitem').map((li) => li.textContent);
  const more = () => screen.queryByRole('button', { name: 'Load more' });

  it('pages through to the end', async () => {
    const fetchPage = createPages();
    render(<Feed fetchPage={fetchPage} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(more().disabled).toBe(true);
    await settle(() => fetchPage.calls[0].resolve(page([1, 2], 'c2')));
    expect(titles()).toEqual(['Post 1', 'Post 2']);
    expect(more().disabled).toBe(false);
    fireEvent.click(more());
    fireEvent.click(more());
    expect(fetchPage.calls).toHaveLength(2);
    await settle(() => fetchPage.last().resolve(page([3], null)));
    expect(titles()).toEqual(['Post 1', 'Post 2', 'Post 3']);
    expect(more()).toBeNull();
    expect(screen.getByText('You\'re all caught up')).toBeTruthy();
  });

  it('shows the error with a retry button', async () => {
    const fetchPage = createPages();
    render(<Feed fetchPage={fetchPage} />);
    await settle(() => fetchPage.calls[0].resolve(page([1], 'c2')));
    fireEvent.click(more());
    await settle(() => fetchPage.last().reject(new Error('503')));
    expect(screen.getByRole('alert').textContent).toBe('Could not load more');
    expect(more()).toBeNull();
    expect(titles()).toEqual(['Post 1']);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByRole('alert')).toBeNull();
    await settle(() => fetchPage.last().resolve(page([2], null)));
    expect(titles()).toEqual(['Post 1', 'Post 2']);
  });
});
