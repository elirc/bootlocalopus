const COLUMNS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'team', label: 'Team', type: 'text' },
  { key: 'age', label: 'Age', type: 'number' },
];

const ROWS = [
  { id: 1, name: 'Ann', team: 'Red', age: 30 },
  { id: 2, name: 'Bob', team: 'Blue', age: 40 },
  { id: 3, name: 'Cid', team: 'Green', age: 50 },
];

/** The value of column `index` in each body row, in display order. */
const column = (index) =>
  screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[index].textContent);

describe('SortableTable', () => {
  it('sorts by age', () => {
    render(<solution.SortableTable columns={COLUMNS} rows={ROWS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Age' }));
    expect(column(2)[0]).toBe('30');
  });

  // TODO: data that exposes the bugs (9/10/102, bea/Bob, ties), descending, switching columns,
  // aria-sort, the filter and the "Showing X of Y" status.
});
