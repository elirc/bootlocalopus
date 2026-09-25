const { createRequestClient, useDedupedQuery, UserBadge } = solution;

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
function createFetcher() {
  const calls = [];
  const fetcher = (key) => { const d = deferred(); calls.push({ key, ...d }); return d.promise; };
  fetcher.calls = calls;
  fetcher.keys = () => calls.map((c) => c.key);
  return fetcher;
}
const settle = async (fn) => { await act(async () => { fn(); }); };
const flush = () => act(async () => {});

describe('createRequestClient', () => {
  it('shares one in-flight request per key', async () => {
    const client = createRequestClient();
    let calls = 0;
    const d = deferred();
    const fn = () => { calls++; return d.promise; };
    const p1 = client.fetch('user:1', fn);
    const p2 = client.fetch('user:1', fn);
    expect(p2).toBe(p1);
    expect(calls).toBe(1);
    d.resolve('Ada');
    expect(await p1).toBe('Ada');
    expect(await p2).toBe('Ada');
  });

  it('does not share across keys or clients', () => {
    const a = createRequestClient();
    const b = createRequestClient();
    let calls = 0;
    const fn = () => { calls++; return new Promise(() => {}); };
    a.fetch('1', fn);
    a.fetch('2', fn);
    b.fetch('1', fn);
    expect(calls).toBe(3);
  });

  it('starts a new request once the previous one has resolved', async () => {
    const client = createRequestClient();
    let calls = 0;
    const fn = async () => { calls++; return calls; };
    expect(await client.fetch('k', fn)).toBe(1);
    expect(await client.fetch('k', fn)).toBe(2);
  });

  it('shares a rejection, then forgets it', async () => {
    const client = createRequestClient();
    let calls = 0;
    const d = deferred();
    const first = client.fetch('k', () => { calls++; return d.promise; });
    const second = client.fetch('k', () => { calls++; return d.promise; });
    d.reject(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    await expect(second).rejects.toThrow('offline');
    await flush();
    const third = await client.fetch('k', async () => { calls++; return 'ok'; });
    expect(third).toBe('ok');
    expect(calls).toBe(2);
  });

  it('turns a synchronous throw into a rejection and does not get stuck', async () => {
    const client = createRequestClient();
    let result;
    expect(() => { result = client.fetch('k', () => { throw new Error('bad input'); }); }).not.toThrow();
    await expect(result).rejects.toThrow('bad input');
    await flush();
    expect(await client.fetch('k', async () => 'fine')).toBe('fine');
  });
});

describe('useDedupedQuery', () => {
  it('loads and succeeds', async () => {
    const client = createRequestClient();
    const fetcher = createFetcher();
    const { result } = renderHook(() => useDedupedQuery(client, 'u1', fetcher));
    expect(result.current).toEqual({ status: 'loading', data: undefined, error: null });
    await settle(() => fetcher.calls[0].resolve({ name: 'Ada' }));
    expect(result.current).toEqual({ status: 'success', data: { name: 'Ada' }, error: null });
  });

  it('reports errors', async () => {
    const client = createRequestClient();
    const fetcher = createFetcher();
    const { result } = renderHook(() => useDedupedQuery(client, 'u1', fetcher));
    const boom = new Error('404');
    await settle(() => fetcher.calls[0].reject(boom));
    expect(result.current).toEqual({ status: 'error', data: undefined, error: boom });
  });

  it('makes one request under StrictMode', () => {
    const client = createRequestClient();
    const fetcher = createFetcher();
    renderHook(() => useDedupedQuery(client, 'u1', fetcher), {
      wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode>,
    });
    expect(fetcher.keys()).toEqual(['u1']);
  });

  it('ignores the old key after switching, and shows loading at once', async () => {
    const client = createRequestClient();
    const fetcher = createFetcher();
    const { result, rerender } = renderHook(({ k }) => useDedupedQuery(client, k, (x) => fetcher(x)), { initialProps: { k: 'u1' } });
    await settle(() => fetcher.calls[0].resolve({ name: 'Ada' }));
    rerender({ k: 'u2' });
    expect(result.current.status).toBe('loading');
    rerender({ k: 'u3' });
    await settle(() => fetcher.calls[1].resolve({ name: 'Old' }));
    expect(result.current.status).toBe('loading');
    await settle(() => fetcher.calls[2].resolve({ name: 'Grace' }));
    expect(result.current.data).toEqual({ name: 'Grace' });
    expect(fetcher.keys()).toEqual(['u1', 'u2', 'u3']);
  });
});

describe('UserBadge', () => {
  it('makes one request per user for a whole thread', async () => {
    const client = createRequestClient();
    const fetchUser = createFetcher();
    const authors = ['ada', 'grace', 'ada', 'ada', 'grace', 'linus'];
    render(<div>{authors.map((a, i) => <UserBadge key={i} client={client} userId={a} fetchUser={fetchUser} />)}</div>);
    expect(fetchUser.keys().sort()).toEqual(['ada', 'grace', 'linus']);
    await settle(() => {
      for (const c of fetchUser.calls) {
        if (c.key === 'linus') c.reject(new Error('gone'));
        else c.resolve({ name: c.key.toUpperCase() });
      }
    });
    const texts = [...document.querySelectorAll('span')].map((s) => s.textContent);
    expect(texts).toEqual(['ADA', 'GRACE', 'ADA', 'ADA', 'GRACE', 'Unknown user']);
  });

  it('fetches again for a badge mounted after the request finished', async () => {
    const client = createRequestClient();
    const fetchUser = createFetcher();
    const { rerender } = render(<div><UserBadge client={client} userId="ada" fetchUser={fetchUser} /></div>);
    await settle(() => fetchUser.calls[0].resolve({ name: 'Ada' }));
    rerender(<div><UserBadge client={client} userId="ada" fetchUser={fetchUser} /><UserBadge client={client} userId="ada" fetchUser={fetchUser} /></div>);
    expect(fetchUser.keys()).toEqual(['ada', 'ada']);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });
});
