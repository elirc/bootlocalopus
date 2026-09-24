const columns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'score', label: 'Score', sortable: true },
  { key: 'team', label: 'Team', sortable: false },
];

const rows = [
  { id: 1, name: 'ada', score: 90, team: 'core' },
  { id: 2, name: 'bob', score: 70, team: 'growth' },
  { id: 3, name: 'cy', score: 85, team: 'core' },
  { id: 4, name: 'dee', score: 60, team: 'growth' },
  { id: 5, name: 'eve', score: 100, team: 'core' },
  { id: 6, name: 'fay', score: 75, team: 'platform' },
  { id: 7, name: 'gus', score: 65, team: 'platform' },
];

const table = () => render(<solution.DataTable rows={rows} columns={columns} />);
const names = () =>
  screen.getAllByRole('row').slice(1).map((tr) => tr.querySelectorAll('td')[0].textContent);
const status = () => screen.getByRole('status').textContent;
const search = (value) => fireEvent.change(screen.getByLabelText('Search'), { target: { value } });
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));

describe('structure', () => {
  it('renders a header per column', () => {
    table();
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers.map((h) => h.textContent)).toEqual(['Name', 'Score', 'Team']);
  });

  it('makes sortable headers buttons and leaves others alone', () => {
    table();
    expect(screen.getByRole('button', { name: 'Name' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Score' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Team' })).toBeNull();
  });

  it('shows one page of rows', () => {
    table();
    expect(names()).toEqual(['ada', 'bob', 'cy']);
    expect(status()).toBe('Showing 1–3 of 7');
  });

  it('respects a custom pageSize', () => {
    render(<solution.DataTable rows={rows} columns={columns} pageSize={2} />);
    expect(names()).toHaveLength(2);
    expect(status()).toBe('Showing 1–2 of 7');
  });
});

describe('pagination', () => {
  it('walks forward and back', () => {
    table();
    click('Next');
    expect(names()).toEqual(['dee', 'eve', 'fay']);
    expect(status()).toBe('Showing 4–6 of 7');
    click('Next');
    expect(names()).toEqual(['gus']);
    expect(status()).toBe('Showing 7–7 of 7');
    click('Previous');
    expect(names()).toEqual(['dee', 'eve', 'fay']);
  });

  it('disables Previous on the first page and Next on the last', () => {
    table();
    expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(false);
    click('Next');
    click('Next');
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(false);
  });
});

describe('search', () => {
  it('filters across every column', () => {
    table();
    search('growth');
    expect(names()).toEqual(['bob', 'dee']);
    expect(status()).toBe('Showing 1–2 of 2');
  });

  it('is case-insensitive', () => {
    table();
    search('ADA');
    expect(names()).toEqual(['ada']);
  });

  it('matches numeric columns', () => {
    table();
    search('100');
    expect(names()).toEqual(['eve']);
  });

  it('shows an empty state with no rows', () => {
    table();
    search('nobody');
    expect(names()).toEqual([]);
    expect(screen.getByText('No results')).toBeTruthy();
  });

  it('resets to page 1', () => {
    table();
    click('Next');
    expect(status()).toBe('Showing 4–6 of 7');
    search('core');
    expect(status()).toBe('Showing 1–3 of 3');
    expect(names()).toEqual(['ada', 'cy', 'eve']);
  });

  it('recovers when the search is cleared', () => {
    table();
    search('core');
    search('');
    expect(names()).toEqual(['ada', 'bob', 'cy']);
    expect(status()).toBe('Showing 1–3 of 7');
  });
});

describe('sorting', () => {
  it('sorts ascending on first click', () => {
    table();
    click('Score');
    expect(names()).toEqual(['dee', 'gus', 'bob']);
  });

  it('flips to descending on a second click', () => {
    table();
    click('Score');
    click('Score');
    expect(names()).toEqual(['eve', 'ada', 'cy']);
  });

  it('sorts numbers numerically, not as strings', () => {
    const numeric = [
      { id: 1, name: 'a', score: 9, team: 'x' },
      { id: 2, name: 'b', score: 100, team: 'x' },
      { id: 3, name: 'c', score: 20, team: 'x' },
    ];
    render(<solution.DataTable rows={numeric} columns={columns} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score' }));
    expect(names()).toEqual(['a', 'c', 'b']);
  });

  it('sorts strings alphabetically', () => {
    table();
    click('Name');
    click('Name');
    expect(names()).toEqual(['gus', 'fay', 'eve']);
  });

  it('starts a new column ascending', () => {
    table();
    click('Score');
    click('Score');
    click('Name');
    expect(names()).toEqual(['ada', 'bob', 'cy']);
  });

  it('reports direction with aria-sort', () => {
    table();
    const headers = () => screen.getAllByRole('columnheader');
    expect(headers().map((h) => h.getAttribute('aria-sort'))).toEqual([null, null, null]);
    click('Score');
    expect(headers()[1].getAttribute('aria-sort')).toBe('ascending');
    expect(headers()[0].getAttribute('aria-sort')).toBe(null);
    click('Score');
    expect(headers()[1].getAttribute('aria-sort')).toBe('descending');
    click('Name');
    expect(headers()[0].getAttribute('aria-sort')).toBe('ascending');
    expect(headers()[1].getAttribute('aria-sort')).toBe(null);
  });

  it('resets to page 1 when the sort changes', () => {
    table();
    click('Next');
    click('Score');
    expect(status()).toBe('Showing 1–3 of 7');
  });
});

describe('the pipeline runs filter -> sort -> paginate', () => {
  it('sorts only the filtered rows', () => {
    table();
    search('core');
    click('Score');
    expect(names()).toEqual(['cy', 'ada', 'eve']);
    expect(status()).toBe('Showing 1–3 of 3');
  });

  it('paginates the sorted, filtered set', () => {
    render(<solution.DataTable rows={rows} columns={columns} pageSize={2} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'core' } });
    // Only the team column contains "core": ada, cy, eve. No name, score or
    // other team does, so the filter really narrows 7 rows to 3.
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(names()).toEqual(['ada', 'cy']);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(names()).toEqual(['eve']);
  });

  it('never mutates the rows it was given', () => {
    const original = rows.map((r) => r.name);
    table();
    click('Score');
    click('Score');
    click('Name');
    expect(rows.map((r) => r.name)).toEqual(original);
  });
});