const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('UserProfile', () => {
  it('shows a loading state first', () => {
    render(<solution.UserProfile userId="1" load={() => new Promise(() => {})} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('renders the name on success', async () => {
    render(<solution.UserProfile userId="1" load={async () => ({ name: 'Ada' })} />);
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('Ada'));
  });

  it('renders an error state with a retry button', async () => {
    render(<solution.UserProfile userId="1" load={async () => { throw new Error('offline'); }} />);
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('retry refetches and can succeed', async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      if (calls === 1) throw new Error('offline');
      return { name: 'Ada' };
    };
    render(<solution.UserProfile userId="1" load={load} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('Ada'));
    expect(calls).toBe(2);
  });

  it('does not refetch when the parent re-renders with a new inline load', async () => {
    let calls = 0;
    function Parent() {
      const [n, setN] = React.useState(0);
      return (
        <div>
          <button onClick={() => setN((x) => x + 1)}>rerender {n}</button>
          <solution.UserProfile userId="1" load={async () => { calls++; return { name: 'Ada' }; }} />
        </div>
      );
    }
    render(<Parent />);
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('Ada'));
    fireEvent.click(screen.getByRole('button', { name: /rerender/ }));
    fireEvent.click(screen.getByRole('button', { name: /rerender/ }));
    await sleep(20);
    expect(calls).toBe(1);
    expect(screen.getByRole('heading').textContent).toBe('Ada');
  });

  it('refetches when userId changes', async () => {
    const seen = [];
    const load = async (id) => { seen.push(id); return { name: 'user ' + id }; };
    const { rerender } = render(<solution.UserProfile userId="1" load={load} />);
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('user 1'));
    rerender(<solution.UserProfile userId="2" load={load} />);
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('user 2'));
    expect(seen).toEqual(['1', '2']);
  });

  it('goes back to loading while the new user is in flight', async () => {
    const first = deferred();
    const second = deferred();
    const load = (id) => (id === '1' ? first.promise : second.promise);
    const { rerender } = render(<solution.UserProfile userId="1" load={load} />);
    await act(async () => { first.resolve({ name: 'Ada' }); });
    expect(screen.getByRole('heading').textContent).toBe('Ada');

    rerender(<solution.UserProfile userId="2" load={load} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    await act(async () => { second.resolve({ name: 'Bob' }); });
    expect(screen.getByRole('heading').textContent).toBe('Bob');
  });

  it('ignores a stale response that resolves last', async () => {
    const first = deferred();
    const second = deferred();
    const load = (id) => (id === '1' ? first.promise : second.promise);

    const { rerender } = render(<solution.UserProfile userId="1" load={load} />);
    rerender(<solution.UserProfile userId="2" load={load} />);

    // The second request wins the race...
    await act(async () => { second.resolve({ name: 'Bob' }); });
    expect(screen.getByRole('heading').textContent).toBe('Bob');

    // ...and the first, arriving late, must not overwrite it.
    await act(async () => { first.resolve({ name: 'Ada (stale)' }); });
    await sleep(10);
    expect(screen.getByRole('heading').textContent).toBe('Bob');
  });

  it('passes an AbortSignal and aborts it on cleanup', async () => {
    const signals = [];
    const load = (id, signal) => { signals.push(signal); return new Promise(() => {}); };
    const { unmount } = render(<solution.UserProfile userId="1" load={load} />);
    expect(signals[0]).toBeDefined();
    expect(signals[0].aborted).toBe(false);
    unmount();
    expect(signals[0].aborted).toBe(true);
  });

  it('does not set state after unmount', async () => {
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args.join(' '));
    const pending = deferred();
    try {
      const { unmount } = render(<solution.UserProfile userId="1" load={() => pending.promise} />);
      unmount();
      pending.resolve({ name: 'Late' });
      await sleep(20);
    } finally {
      console.error = originalError;
    }
    expect(errors.join(' ')).not.toContain('unmounted');
  });
});