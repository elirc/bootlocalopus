const { createQueryClient, QueryClientProvider, useQueryClient, useQuery } = solution;

// A fetcher per key whose calls the test settles by hand.
function createServer() {
  const calls = [];
  const fetcherFor = (name) => () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    calls.push({ name, resolve, reject });
    return promise;
  };
  const names = () => calls.map((c) => c.name);
  const last = (name) => [...calls].reverse().find((c) => c.name === name);
  const count = (name) => calls.filter((c) => c.name === name).length;
  return { fetcherFor, calls, names, last, count };
}
const settle = async (fn) => { await act(async () => { fn(); }); };

function setup() {
  const clock = { t: 1_000_000 };
  const client = createQueryClient({ now: () => clock.t });
  const server = createServer();
  const views = {};
  function View({ id, qkey, name = id, staleTime, enabled }) {
    const options = {};
    if (staleTime !== undefined) options.staleTime = staleTime;
    if (enabled !== undefined) options.enabled = enabled;
    const q = useQuery(qkey, server.fetcherFor(name), options);
    views[id] = q;
    return <p data-testid={id}>{q.status}:{String(q.data)}</p>;
  }
  const wrap = (children) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const ui = (children) => {
    const r = render(wrap(children));
    return { ...r, rerender: (c) => r.rerender(wrap(c)) };
  };
  const text = (id) => screen.getByTestId(id).textContent;
  return { clock, client, server, views, View, ui, text };
}

describe('useQuery basics', () => {
  it('loads, and shares one request between components with the same key', async () => {
    const { server, View, ui, text, views } = setup();
    ui(<div><View id="a" qkey={['todos']} name="todos" /><View id="b" qkey={['todos']} name="todos" /></div>);
    expect(server.names()).toEqual(['todos']);
    expect(views.a).toMatchObject({ status: 'loading', data: undefined, isFetching: true });
    await settle(() => server.calls[0].resolve('T1'));
    expect(text('a')).toBe('success:T1');
    expect(text('b')).toBe('success:T1');
    expect(views.a).toMatchObject({ error: null, isFetching: false });
  });

  it('keeps different keys apart, comparing keys by value', async () => {
    const { server, View, ui } = setup();
    ui(<div>
      <View id="a" qkey={['todo', 1]} name="n1" />
      <View id="b" qkey={['todo', '1']} name="s1" />
      <View id="c" qkey={['todo', 1]} name="n1" />
    </div>);
    expect(server.names()).toEqual(['n1', 's1']);
  });

  it('does not refetch on re-render with a new inline fetcher', async () => {
    const { server, View, ui } = setup();
    const { rerender } = ui(<View id="a" qkey={['x']} />);
    await settle(() => server.calls[0].resolve(1));
    rerender(<View id="a" qkey={['x']} />);
    rerender(<View id="a" qkey={['x']} />);
    expect(server.count('a')).toBe(1);
  });

  it('shows the new key\'s own state on the first render after a key change', async () => {
    const { server, ui } = setup();
    const commits = [];
    function Probe({ k }) {
      const q = useQuery([k], server.fetcherFor(k));
      React.useLayoutEffect(() => { commits.push({ k, data: q.data, status: q.status }); });
      return null;
    }
    const { rerender } = ui(<Probe k="p1" />);
    await settle(() => server.calls[0].resolve('one'));
    rerender(<Probe k="p2" />);
    const forP2 = commits.filter((c) => c.k === 'p2');
    expect(forP2[0]).toEqual({ k: 'p2', data: undefined, status: 'loading' });
  });

  it('keeps data when a refetch fails, and reports an error when there is none', async () => {
    const { server, View, ui, views } = setup();
    ui(<div><View id="a" qkey={['a']} /><View id="b" qkey={['b']} /></div>);
    await settle(() => server.last('a').resolve('A'));
    act(() => views.a.refetch());
    const boom = new Error('503');
    await settle(() => server.last('a').reject(boom));
    expect(views.a).toMatchObject({ status: 'success', data: 'A', error: boom, isFetching: false });
    await settle(() => server.last('b').reject(boom));
    expect(views.b).toMatchObject({ status: 'error', data: undefined, error: boom, isFetching: false });
  });

  it('throws a helpful error without a provider', () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(() => renderHook(() => useQuery(['x'], async () => 1))).toThrow('useQueryClient must be used within a QueryClientProvider');
    } finally {
      console.error = original;
    }
  });

  it('exposes the client through useQueryClient', () => {
    const { client } = setup();
    const { result } = renderHook(() => useQueryClient(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    expect(result.current).toBe(client);
  });
});

describe('staleness', () => {
  it('serves fresh data from the cache without fetching', async () => {
    const { server, View, ui, text, clock } = setup();
    const { rerender } = ui(<View id="a" qkey={['user']} staleTime={30_000} />);
    await settle(() => server.calls[0].resolve('U1'));
    rerender(<div />);
    clock.t += 10_000;
    rerender(<View id="a" qkey={['user']} staleTime={30_000} />);
    expect(text('a')).toBe('success:U1');
    expect(server.count('a')).toBe(1);
  });

  it('shows stale data at once and revalidates in the background', async () => {
    const { server, View, ui, text, clock, views } = setup();
    const { rerender } = ui(<View id="a" qkey={['user']} staleTime={30_000} />);
    await settle(() => server.calls[0].resolve('U1'));
    rerender(<div />);
    clock.t += 30_000;
    rerender(<View id="a" qkey={['user']} staleTime={30_000} />);
    expect(text('a')).toBe('success:U1');
    expect(views.a.isFetching).toBe(true);
    expect(server.count('a')).toBe(2);
    await settle(() => server.last('a').resolve('U2'));
    expect(text('a')).toBe('success:U2');
  });

  it('treats data as stale immediately by default', async () => {
    const { server, View, ui, text } = setup();
    const { rerender } = ui(<View id="a" qkey={['user']} />);
    await settle(() => server.calls[0].resolve('U1'));
    rerender(<div />);
    rerender(<View id="a" qkey={['user']} />);
    expect(text('a')).toBe('success:U1');
    expect(server.count('a')).toBe(2);
  });

  it('refetches stale active queries when the window regains focus', async () => {
    const { server, View, ui, clock } = setup();
    ui(<div>
      <View id="stale" qkey={['s']} staleTime={1000} />
      <View id="fresh" qkey={['f']} staleTime={60_000} />
    </div>);
    await settle(() => { server.last('stale').resolve(1); server.last('fresh').resolve(2); });
    clock.t += 5000;
    act(() => { window.dispatchEvent(new window.FocusEvent('focus')); });
    expect(server.count('stale')).toBe(2);
    expect(server.count('fresh')).toBe(1);
  });

  it('stops listening for focus when the provider unmounts', async () => {
    const { server, View, ui, clock } = setup();
    const { unmount } = ui(<View id="a" qkey={['a']} />);
    await settle(() => server.calls[0].resolve(1));
    unmount();
    clock.t += 5000;
    act(() => { window.dispatchEvent(new window.FocusEvent('focus')); });
    expect(server.count('a')).toBe(1);
  });
});

describe('invalidation and cache writes', () => {
  it('refetches active queries under a prefix, and only those', async () => {
    const { server, View, ui, client } = setup();
    ui(<div>
      <View id="list" qkey={['todos', 'list']} staleTime={60_000} />
      <View id="one" qkey={['todos', 1]} staleTime={60_000} />
      <View id="users" qkey={['users']} staleTime={60_000} />
    </div>);
    await settle(() => { for (const c of [...server.calls]) c.resolve('v1'); });
    act(() => client.invalidateQueries(['todos']));
    expect(server.count('list')).toBe(2);
    expect(server.count('one')).toBe(2);
    expect(server.count('users')).toBe(1);
  });

  it('marks inactive queries stale so they refetch on the next mount', async () => {
    const { server, View, ui, client, text } = setup();
    const { rerender } = ui(<View id="a" qkey={['todos', 'list']} staleTime={60_000} />);
    await settle(() => server.calls[0].resolve('v1'));
    rerender(<div />);
    act(() => client.invalidateQueries(['todos']));
    expect(server.count('a')).toBe(1);
    rerender(<View id="a" qkey={['todos', 'list']} staleTime={60_000} />);
    expect(text('a')).toBe('success:v1');
    expect(server.count('a')).toBe(2);
  });

  it('lets the invalidation refetch win over an older request still in flight', async () => {
    const { server, View, ui, client, text } = setup();
    ui(<View id="a" qkey={['todos']} />);
    const older = server.calls[0];
    act(() => client.invalidateQueries(['todos']));
    expect(server.count('a')).toBe(2);
    await settle(() => server.last('a').resolve('after mutation'));
    await settle(() => older.resolve('before mutation'));
    expect(text('a')).toBe('success:after mutation');
  });

  it('setQueryData updates every subscriber and the cache', async () => {
    const { server, View, ui, client, text } = setup();
    ui(<div><View id="a" qkey={['n']} name="n" /><View id="b" qkey={['n']} name="n" /></div>);
    await settle(() => server.calls[0].resolve(1));
    act(() => client.setQueryData(['n'], 5));
    expect(text('a')).toBe('success:5');
    expect(text('b')).toBe('success:5');
    act(() => client.setQueryData(['n'], (old) => old + 1));
    expect(client.getQueryData(['n'])).toBe(6);
    expect(text('b')).toBe('success:6');
    expect(client.getQueryData(['never'])).toBeUndefined();
  });

  it('does not let a response already in flight overwrite setQueryData', async () => {
    const { server, View, ui, client, text } = setup();
    ui(<View id="a" qkey={['n']} />);
    act(() => client.setQueryData(['n'], 'from mutation'));
    await settle(() => server.calls[0].resolve('older response'));
    expect(text('a')).toBe('success:from mutation');
  });

  it('refetch() always requests again', async () => {
    const { server, View, ui, views } = setup();
    ui(<View id="a" qkey={['a']} staleTime={60_000} />);
    await settle(() => server.calls[0].resolve(1));
    act(() => views.a.refetch());
    expect(server.count('a')).toBe(2);
  });

  it('forgets unmounted components: invalidation no longer fetches for them', async () => {
    const { server, View, ui, client } = setup();
    const { rerender } = ui(<View id="a" qkey={['a']} />);
    await settle(() => server.calls[0].resolve(1));
    rerender(<div />);
    act(() => client.invalidateQueries(['a']));
    expect(server.count('a')).toBe(1);
  });
});

describe('dependent queries', () => {
  it('does not fetch while enabled is false', async () => {
    const { server, View, ui, views } = setup();
    const { rerender } = ui(<View id="a" qkey={['projects', null]} enabled={false} />);
    expect(server.count('a')).toBe(0);
    expect(views.a.status).toBe('loading');
    expect(views.a.isFetching).toBe(false);
    rerender(<View id="a" qkey={['projects', 7]} enabled />);
    expect(server.count('a')).toBe(1);
  });
});
