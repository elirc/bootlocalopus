function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** A search whose calls are recorded and whose promises you settle one by one. */
function controlledSearch() {
  const calls = [];
  const pending = [];
  const search = (query) => {
    calls.push(query);
    const d = deferred();
    pending.push(d);
    return d.promise;
  };
  return { search, calls, pending };
}

const field = () => screen.getByLabelText('Search users');
const searchFor = (text) => {
  fireEvent.change(field(), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
};
const names = () => screen.queryAllByRole('listitem').map((li) => li.textContent);

const ANN = [{ id: 1, name: 'Ann Lee' }];
const ANNA = [{ id: 2, name: 'Anna Berg' }, { id: 3, name: 'Anna Kay' }];

describe('states', () => {
  it('shows loading, then the results, then no loading', async () => {
    const s = controlledSearch();
    render(<solution.UserSearch search={s.search} />);
    searchFor('ann');
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(s.calls).toEqual(['ann']);

    await act(async () => { s.pending[0].resolve(ANN); });
    expect(names()).toEqual(['Ann Lee']);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says so when nothing matches', async () => {
    const s = controlledSearch();
    render(<solution.UserSearch search={s.search} />);
    searchFor('zed');
    await act(async () => { s.pending[0].resolve([]); });
    expect(screen.getByText('No users match "zed"')).toBeTruthy();
    expect(names()).toEqual([]);
  });

  it('shows an alert on failure, and no loading indicator', async () => {
    const s = controlledSearch();
    render(<solution.UserSearch search={s.search} />);
    searchFor('ann');
    await act(async () => { s.pending[0].reject(new Error('503')); });
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong.');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Retry searches the query that failed, not whatever is in the field now', async () => {
    const s = controlledSearch();
    render(<solution.UserSearch search={s.search} />);
    searchFor('ann');
    await act(async () => { s.pending[0].reject(new Error('503')); });

    fireEvent.change(field(), { target: { value: 'bob' } });
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }));
    expect(s.calls).toEqual(['ann', 'ann']);

    await act(async () => { s.pending[1].resolve(ANN); });
    expect(names()).toEqual(['Ann Lee']);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the query', () => {
  it('does not search for blank input', () => {
    const s = controlledSearch();
    render(<solution.UserSearch search={s.search} />);
    searchFor('   ');
    expect(s.calls).toEqual([]);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('trims the query', () => {
    const s = controlledSearch();
    render(<solution.UserSearch search={s.search} />);
    searchFor('  ann  ');
    expect(s.calls).toEqual(['ann']);
  });
});

describe('out-of-order responses', () => {
  it('ignores an older search that resolves after a newer one', async () => {
    const s = controlledSearch();
    render(<solution.UserSearch search={s.search} />);
    searchFor('ann');
    searchFor('anna');
    await act(async () => { s.pending[1].resolve(ANNA); });
    await act(async () => { s.pending[0].resolve(ANN); });
    expect(names()).toEqual(['Anna Berg', 'Anna Kay']);
  });

  it('ignores an older search that fails after a newer one succeeded', async () => {
    const s = controlledSearch();
    render(<solution.UserSearch search={s.search} />);
    searchFor('ann');
    searchFor('anna');
    await act(async () => { s.pending[1].resolve(ANNA); });
    await act(async () => { s.pending[0].reject(new Error('timeout')); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(names()).toEqual(['Anna Berg', 'Anna Kay']);
  });
});
