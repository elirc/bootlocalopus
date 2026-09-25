const csv = [
  'date,description,amount',
  '2024-03-02,Coffee beans,12.5',
  '2024-03-01,Rent,950',
  '2024-03-03,Coffee,3.2',
].join('\n');

const work = (kind) => solution.workLog.filter((w) => w === kind).length;
const reset = () => { solution.workLog.length = 0; };
const lines = () => screen.getAllByRole('listitem').map((li) => li.textContent.replace(/\s+/g, ' ').trim());
const filterTo = (value) => fireEvent.change(screen.getByLabelText('Filter'), { target: { value } });

/** Counts `new Intl.NumberFormat(...)` while `fn` runs. */
function countFormatters(fn) {
  const Real = Intl.NumberFormat;
  let made = 0;
  function Spy(...args) { made++; return new Real(...args); }
  Spy.prototype = Real.prototype;
  Spy.supportedLocalesOf = Real.supportedLocalesOf;
  Intl.NumberFormat = Spy;
  try { fn(); } finally { Intl.NumberFormat = Real; }
  return made;
}

beforeEach(reset);

describe('Ledger still works', () => {
  it('lists the rows by date, formatted in the currency', () => {
    render(<solution.Ledger csv={csv} currency="USD" />);
    expect(lines()).toEqual([
      '2024-03-01 Rent $950.00',
      '2024-03-02 Coffee beans $12.50',
      '2024-03-03 Coffee $3.20',
    ]);
  });

  it('filters and sorts', () => {
    render(<solution.Ledger csv={csv} currency="USD" />);
    filterTo('coffee');
    fireEvent.click(screen.getByRole('button', { name: 'Sort by amount' }));
    expect(lines()).toEqual(['2024-03-03 Coffee $3.20', '2024-03-02 Coffee beans $12.50']);
  });

  it('remembers the sort order in localStorage', () => {
    localStorage.setItem('ledger-settings', JSON.stringify({ sortBy: 'amount' }));
    render(<solution.Ledger csv={csv} currency="USD" />);
    expect(lines()[0]).toBe('2024-03-03 Coffee $3.20');
    expect(screen.getByRole('button', { name: 'Sort by amount' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('switches currency', () => {
    const { rerender } = render(<solution.Ledger csv={csv} currency="USD" />);
    rerender(<solution.Ledger csv={csv} currency="EUR" />);
    expect(lines()[0]).toBe('2024-03-01 Rent €950.00');
  });
});

describe('Ledger does expensive work only when it must', () => {
  it('loads settings once, not on every render', () => {
    render(<solution.Ledger csv={csv} currency="USD" />);
    filterTo('c');
    filterTo('co');
    fireEvent.click(screen.getByRole('button', { name: 'Sort by amount' }));
    expect(work('load')).toBe(1);
  });

  it('does not re-parse while the user types in the filter', () => {
    render(<solution.Ledger csv={csv} currency="USD" />);
    expect(work('parse')).toBe(1);
    filterTo('c');
    filterTo('co');
    filterTo('cof');
    expect(work('parse')).toBe(1);
  });

  it('does not re-parse when the sort changes', () => {
    render(<solution.Ledger csv={csv} currency="USD" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort by amount' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sort by date' }));
    expect(work('parse')).toBe(1);
  });

  it('re-parses once when the csv changes, and not for an equal string', () => {
    const { rerender } = render(<solution.Ledger csv={csv} currency="USD" />);
    rerender(<solution.Ledger csv={csv + '\n2024-03-04,Tea,2'} currency="USD" />);
    expect(work('parse')).toBe(2);
    expect(lines()).toHaveLength(4);
    rerender(<solution.Ledger csv={csv + '\n2024-03-04,Tea,2'} currency="USD" />);
    expect(work('parse')).toBe(2);
  });

  it('does not build a number formatter per row, per render', () => {
    const made = countFormatters(() => {
      render(<solution.Ledger csv={csv} currency="USD" />);
      filterTo('c');
      filterTo('co');
      filterTo('');
    });
    // Three rows, four renders: one formatter per row per render would be 12.
    expect(made).toBeLessThanOrEqual(1);
  });
});
