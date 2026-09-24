const items = [
  { id: 1, name: 'alpha' },
  { id: 2, name: 'beta' },
  { id: 3, name: 'gamma' },
];

const rowRenders = () => solution.renderLog.filter((e) => e.startsWith('row:'));
const reset = () => { solution.renderLog.length = 0; };

beforeEach(reset);

describe('Board renders', () => {
  it('renders every row once on mount', () => {
    render(<solution.Board items={items} />);
    expect(rowRenders()).toEqual(['row:1', 'row:2', 'row:3']);
  });

  it('does not re-render any row when unrelated state changes', () => {
    render(<solution.Board items={items} />);
    reset();
    fireEvent.click(screen.getByRole('button', { name: /Bump/ }));
    fireEvent.click(screen.getByRole('button', { name: /Bump/ }));
    expect(solution.renderLog).toContain('board');
    expect(rowRenders()).toEqual([]);
  });

  it('keeps the filtered array identity stable across an unrelated re-render', () => {
    // Summary is memo()ised and receives `visible`. It can only skip the
    // Bump re-render if `visible` is the same array as last time.
    render(<solution.Board items={items} />);
    reset();
    fireEvent.click(screen.getByRole('button', { name: /Bump/ }));
    expect(solution.renderLog).toContain('board');
    expect(solution.renderLog).not.toContain('summary');
  });

  it('recomputes the filtered array when the filter changes', () => {
    render(<solution.Board items={items} />);
    reset();
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'a' } });
    expect(solution.renderLog).toContain('summary');
  });

  it('re-renders only the rows whose selection changed', () => {
    render(<solution.Board items={items} />);
    reset();
    fireEvent.click(screen.getByRole('button', { name: 'Select beta' }));
    // Only row 2 flipped from unselected to selected.
    expect(rowRenders()).toEqual(['row:2']);
    expect(screen.getAllByRole('listitem')[1].textContent).toContain('beta (selected)');
  });

  it('re-renders the two affected rows when selection moves', () => {
    render(<solution.Board items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select beta' }));
    reset();
    fireEvent.click(screen.getByRole('button', { name: 'Select gamma' }));
    expect(rowRenders().sort()).toEqual(['row:2', 'row:3']);
  });

  it('does not re-render surviving rows when the filter narrows', () => {
    render(<solution.Board items={items} />);
    reset();
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'al' } });
    // Only alpha still matches, and its props are unchanged, so it must not re-render.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(rowRenders()).toEqual([]);
  });

  it('still filters correctly', () => {
    render(<solution.Board items={items} />);
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'bet' } });
    const shown = screen.getAllByRole('listitem');
    expect(shown).toHaveLength(1);
    expect(shown[0].textContent).toContain('beta');
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: '' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('keeps the bump counter working', () => {
    render(<solution.Board items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /Bump/ }));
    expect(screen.getByRole('button', { name: 'Bump 1' })).toBeTruthy();
  });

  it('memoises the row component itself', () => {
    // A memo() component exposes its inner type; a plain function does not.
    expect(solution.ExpensiveRow.$$typeof).toBeDefined();
    expect(String(solution.ExpensiveRow.$$typeof)).toContain('memo');
  });
});