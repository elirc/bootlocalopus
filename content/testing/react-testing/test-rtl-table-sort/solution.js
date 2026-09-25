const COLUMNS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'team', label: 'Team', type: 'text' },
  { key: 'age', label: 'Age', type: 'number' },
];

// Built to expose bugs: 9/10/102 sort differently as text, "bea" and "Bob" differ in case,
// and Red has three members (Ann, dee, Cid) in a known original order.
const ROWS = [
  { id: 1, name: 'Ann', team: 'Red', age: 102 },
  { id: 2, name: 'bea', team: 'Blue', age: 9 },
  { id: 3, name: 'dee', team: 'Red', age: 10 },
  { id: 4, name: 'Bob', team: 'Green', age: 40 },
  { id: 5, name: 'Cid', team: 'Red', age: 30 },
];

const column = (index) =>
  screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[index].textContent);
const names = () => column(0);
const click = (label) => fireEvent.click(screen.getByRole('button', { name: label }));
const ariaSort = (label) => screen.getByRole('columnheader', { name: label }).getAttribute('aria-sort') ?? 'none';

const setup = () => render(<solution.SortableTable columns={COLUMNS} rows={ROWS} />);

describe('sorting', () => {
  it('keeps the original order before any click', () => {
    setup();
    expect(names()).toEqual(['Ann', 'bea', 'dee', 'Bob', 'Cid']);
  });

  it('sorts numbers numerically, then toggles to descending', () => {
    setup();
    click('Age');
    expect(column(2)).toEqual(['9', '10', '30', '40', '102']);
    click('Age');
    expect(column(2)).toEqual(['102', '40', '30', '10', '9']);
    click('Age');
    expect(column(2)).toEqual(['9', '10', '30', '40', '102']);
  });

  it('sorts text ignoring case', () => {
    setup();
    click('Name');
    expect(names()).toEqual(['Ann', 'bea', 'Bob', 'Cid', 'dee']);
  });

  it('keeps ties in their original order, ascending and descending', () => {
    setup();
    click('Team');
    expect(names()).toEqual(['bea', 'Bob', 'Ann', 'dee', 'Cid']);
    click('Team');
    expect(names()).toEqual(['Ann', 'dee', 'Cid', 'Bob', 'bea']);
  });

  it('starts a different column ascending, whatever the previous direction', () => {
    setup();
    click('Name');
    click('Name'); // Name descending
    click('Age');
    expect(column(2)).toEqual(['9', '10', '30', '40', '102']);
  });
});

describe('aria-sort', () => {
  it('marks only the sorted column, with its direction', () => {
    setup();
    expect(['Name', 'Team', 'Age'].map(ariaSort)).toEqual(['none', 'none', 'none']);
    click('Age');
    expect(['Name', 'Team', 'Age'].map(ariaSort)).toEqual(['none', 'none', 'ascending']);
    click('Age');
    expect(ariaSort('Age')).toBe('descending');
    click('Name');
    expect(['Name', 'Team', 'Age'].map(ariaSort)).toEqual(['ascending', 'none', 'none']);
  });
});

describe('filtering', () => {
  const filter = (text) => fireEvent.change(screen.getByLabelText('Filter'), { target: { value: text } });
  const status = () => screen.getByRole('status').textContent;

  it('matches text columns ignoring case, and counts against all rows', () => {
    setup();
    expect(status()).toBe('Showing 5 of 5');
    filter('  RED ');
    expect(names()).toEqual(['Ann', 'dee', 'Cid']);
    expect(status()).toBe('Showing 3 of 5');
  });

  it('shows an empty state when nothing matches', () => {
    setup();
    filter('purple');
    expect(status()).toBe('Showing 0 of 5');
    expect(screen.getByText('No matching rows')).toBeTruthy();
  });

  it('sorts the filtered rows', () => {
    setup();
    filter('red');
    click('Age');
    expect(names()).toEqual(['dee', 'Cid', 'Ann']);
  });
});
