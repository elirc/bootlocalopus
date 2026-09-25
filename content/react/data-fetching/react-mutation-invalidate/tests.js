const { useLatestQuery, useMutation, TodoApp } = solution;

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
function controllable() {
  const calls = [];
  const fn = (...args) => { const d = deferred(); calls.push({ args, ...d }); return d.promise; };
  fn.calls = calls;
  fn.last = () => calls[calls.length - 1];
  return fn;
}
const settle = async (fn) => { await act(async () => { fn(); }); };

describe('useLatestQuery', () => {
  it('fetches on mount and keeps data while refetching', async () => {
    const fetcher = controllable();
    const { result } = renderHook(() => useLatestQuery(() => fetcher()));
    expect(fetcher.calls).toHaveLength(1);
    expect(result.current).toMatchObject({ data: undefined, error: null, isFetching: true });
    await settle(() => fetcher.calls[0].resolve(['a']));
    expect(result.current).toMatchObject({ data: ['a'], error: null, isFetching: false });
    act(() => result.current.refetch());
    expect(result.current).toMatchObject({ data: ['a'], isFetching: true });
    await settle(() => fetcher.last().resolve(['a', 'b']));
    expect(result.current).toMatchObject({ data: ['a', 'b'], isFetching: false });
  });

  it('applies only the latest request, whatever order they settle in', async () => {
    const fetcher = controllable();
    const { result } = renderHook(() => useLatestQuery(() => fetcher()));
    await settle(() => fetcher.calls[0].resolve(['v1']));
    act(() => result.current.refetch());
    act(() => result.current.refetch());
    const [, older, newer] = fetcher.calls;
    await settle(() => newer.resolve(['v3']));
    expect(result.current).toMatchObject({ data: ['v3'], isFetching: false });
    await settle(() => older.resolve(['v2 (stale)']));
    expect(result.current.data).toEqual(['v3']);
    act(() => result.current.refetch());
    await settle(() => older.reject(new Error('late failure')));
    expect(result.current.error).toBeNull();
    expect(result.current.isFetching).toBe(true);
  });

  it('reports an error from the latest request, keeping data', async () => {
    const fetcher = controllable();
    const { result } = renderHook(() => useLatestQuery(() => fetcher()));
    await settle(() => fetcher.calls[0].resolve(['a']));
    act(() => result.current.refetch());
    const boom = new Error('503');
    await settle(() => fetcher.last().reject(boom));
    expect(result.current).toMatchObject({ data: ['a'], error: boom, isFetching: false });
    act(() => result.current.refetch());
    await settle(() => fetcher.last().resolve(['b']));
    expect(result.current.error).toBeNull();
  });

  it('keeps refetch stable', async () => {
    const fetcher = controllable();
    const { result, rerender } = renderHook(() => useLatestQuery(() => fetcher()));
    const first = result.current.refetch;
    await settle(() => fetcher.calls[0].resolve([]));
    rerender();
    expect(result.current.refetch).toBe(first);
  });
});

describe('useMutation', () => {
  it('goes idle, pending, success and calls onSuccess', async () => {
    const fn = controllable();
    const seen = [];
    const { result } = renderHook(() => useMutation(fn, { onSuccess: (d, v) => seen.push([d, v]) }));
    expect(result.current).toMatchObject({ status: 'idle', data: undefined, error: null });
    act(() => { expect(result.current.mutate('milk')).toBeUndefined(); });
    expect(fn.calls[0].args).toEqual(['milk']);
    expect(result.current.status).toBe('pending');
    await settle(() => fn.calls[0].resolve({ id: 1 }));
    expect(result.current).toMatchObject({ status: 'success', data: { id: 1 }, error: null });
    expect(seen).toEqual([[{ id: 1 }, 'milk']]);
  });

  it('reports errors through state and onError, without an unhandled rejection', async () => {
    const fn = controllable();
    const seen = [];
    const { result } = renderHook(() => useMutation(fn, { onError: (e, v) => seen.push([e.message, v]) }));
    act(() => result.current.mutate('x'));
    const boom = new Error('409');
    await settle(() => fn.calls[0].reject(boom));
    expect(result.current).toMatchObject({ status: 'error', error: boom, data: undefined });
    expect(seen).toEqual([['409', 'x']]);
  });

  it('handles a mutationFn that throws synchronously', async () => {
    const { result } = renderHook(() => useMutation(() => { throw new Error('invalid'); }));
    act(() => result.current.mutate());
    await act(async () => {});
    expect(result.current.status).toBe('error');
    expect(result.current.error.message).toBe('invalid');
  });

  it('shows the latest call\'s result but runs callbacks for every call', async () => {
    const fn = controllable();
    const seen = [];
    const { result } = renderHook(() => useMutation(fn, { onSuccess: (d) => seen.push(d) }));
    act(() => result.current.mutate(1));
    act(() => result.current.mutate(2));
    await settle(() => fn.calls[1].resolve('second'));
    await settle(() => fn.calls[0].resolve('first (late)'));
    expect(result.current.data).toBe('second');
    expect(seen).toEqual(['second', 'first (late)']);
  });

  it('uses the latest callbacks, even after unmount', async () => {
    const fn = controllable();
    const seen = [];
    const { result, rerender, unmount } = renderHook(({ tag }) => useMutation(fn, { onSuccess: () => seen.push(tag) }), {
      initialProps: { tag: 'old' },
    });
    act(() => result.current.mutate());
    rerender({ tag: 'new' });
    unmount();
    await settle(() => fn.calls[0].resolve('ok'));
    expect(seen).toEqual(['new']);
  });

  it('reset returns to idle, and mutate/reset are stable', async () => {
    const fn = controllable();
    const { result } = renderHook(() => useMutation(fn));
    const { mutate, reset } = result.current;
    act(() => mutate());
    await settle(() => fn.calls[0].reject(new Error('x')));
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ status: 'idle', data: undefined, error: null });
    expect(result.current.mutate).toBe(mutate);
    expect(result.current.reset).toBe(reset);
  });
});

describe('TodoApp', () => {
  function createApi() {
    return { fetchTodos: controllable(), addTodo: controllable() };
  }
  const items = () => screen.queryAllByRole('listitem').map((li) => li.textContent);
  const input = () => screen.getByRole('textbox', { name: 'New todo' });
  const addButton = () => screen.getByRole('button', { name: 'Add' });

  it('adds a todo, clears the input and refetches', async () => {
    const api = createApi();
    render(<TodoApp api={api} />);
    await settle(() => api.fetchTodos.calls[0].resolve([{ id: 1, title: 'Milk' }]));
    fireEvent.change(input(), { target: { value: 'Eggs' } });
    fireEvent.submit(input().closest('form'));
    expect(api.addTodo.calls[0].args).toEqual(['Eggs']);
    expect(addButton().disabled).toBe(true);
    await settle(() => api.addTodo.calls[0].resolve({ id: 2, title: 'Eggs' }));
    expect(input().value).toBe('');
    expect(addButton().disabled).toBe(false);
    expect(api.fetchTodos.calls).toHaveLength(2);
    await settle(() => api.fetchTodos.last().resolve([{ id: 1, title: 'Milk' }, { id: 2, title: 'Eggs' }]));
    expect(items()).toEqual(['Milk', 'Eggs']);
  });

  it('does not submit twice while pending', async () => {
    const api = createApi();
    render(<TodoApp api={api} />);
    fireEvent.change(input(), { target: { value: 'Eggs' } });
    fireEvent.submit(input().closest('form'));
    fireEvent.submit(input().closest('form'));
    expect(api.addTodo.calls).toHaveLength(1);
  });

  it('keeps the text and shows the error on failure', async () => {
    const api = createApi();
    render(<TodoApp api={api} />);
    fireEvent.change(input(), { target: { value: 'Eggs' } });
    fireEvent.submit(input().closest('form'));
    await settle(() => api.addTodo.calls[0].reject(new Error('quota exceeded')));
    expect(screen.getByRole('alert').textContent).toBe('Could not add todo: quota exceeded');
    expect(input().value).toBe('Eggs');
    expect(api.fetchTodos.calls).toHaveLength(1);
  });

  it('does not let an older refresh overwrite the list after the add', async () => {
    const api = createApi();
    render(<TodoApp api={api} />);
    await settle(() => api.fetchTodos.calls[0].resolve([{ id: 1, title: 'Milk' }]));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    const slowRefresh = api.fetchTodos.last();
    fireEvent.change(input(), { target: { value: 'Eggs' } });
    fireEvent.submit(input().closest('form'));
    await settle(() => api.addTodo.calls[0].resolve({ id: 2, title: 'Eggs' }));
    await settle(() => api.fetchTodos.last().resolve([{ id: 1, title: 'Milk' }, { id: 2, title: 'Eggs' }]));
    await settle(() => slowRefresh.resolve([{ id: 1, title: 'Milk' }]));
    expect(items()).toEqual(['Milk', 'Eggs']);
  });
});
