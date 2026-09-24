const widget = { id: 'w', name: 'Widget', price: 9.99 };
const gadget = { id: 'g', name: 'Gadget', price: 4.5 };
const catalogue = [widget, gadget];

describe('cartReducer (pure)', () => {
  const empty = { lines: [] };

  it('adds a new line with qty 1', () => {
    expect(solution.cartReducer(empty, { type: 'add', item: widget })).toEqual({
      lines: [{ id: 'w', name: 'Widget', price: 9.99, qty: 1 }],
    });
  });

  it('increments an existing line instead of duplicating it', () => {
    const once = solution.cartReducer(empty, { type: 'add', item: widget });
    const twice = solution.cartReducer(once, { type: 'add', item: widget });
    expect(twice.lines).toHaveLength(1);
    expect(twice.lines[0].qty).toBe(2);
  });

  it('does not mutate the previous state', () => {
    const once = solution.cartReducer(empty, { type: 'add', item: widget });
    const snapshot = JSON.stringify(once);
    solution.cartReducer(once, { type: 'add', item: widget });
    solution.cartReducer(once, { type: 'setQty', id: 'w', qty: 7 });
    solution.cartReducer(once, { type: 'remove', id: 'w' });
    expect(JSON.stringify(once)).toBe(snapshot);
  });

  it('removes a line', () => {
    const state = { lines: [{ ...widget, qty: 1 }, { ...gadget, qty: 2 }] };
    expect(solution.cartReducer(state, { type: 'remove', id: 'w' }).lines).toEqual([
      { ...gadget, qty: 2 },
    ]);
  });

  it('sets a quantity', () => {
    const state = { lines: [{ ...widget, qty: 1 }] };
    expect(solution.cartReducer(state, { type: 'setQty', id: 'w', qty: 5 }).lines[0].qty).toBe(5);
  });

  it('treats a quantity of 0 or less as a removal', () => {
    const state = { lines: [{ ...widget, qty: 3 }] };
    expect(solution.cartReducer(state, { type: 'setQty', id: 'w', qty: 0 }).lines).toEqual([]);
    expect(solution.cartReducer(state, { type: 'setQty', id: 'w', qty: -2 }).lines).toEqual([]);
  });

  it('clears', () => {
    const state = { lines: [{ ...widget, qty: 3 }] };
    expect(solution.cartReducer(state, { type: 'clear' })).toEqual({ lines: [] });
  });

  it('returns the identical state object for an unknown action', () => {
    const state = { lines: [] };
    expect(solution.cartReducer(state, { type: 'nonsense' })).toBe(state);
  });
});

describe('Cart (rendered)', () => {
  it('starts empty', () => {
    render(<solution.Cart catalogue={catalogue} />);
    expect(screen.getByText('Your cart is empty')).toBeTruthy();
    expect(screen.getByText('Total: $0.00')).toBeTruthy();
  });

  it('adds an item', () => {
    render(<solution.Cart catalogue={catalogue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    expect(screen.getByText(/Widget x1/)).toBeTruthy();
    expect(screen.getByText('Total: $9.99')).toBeTruthy();
    expect(screen.queryByText('Your cart is empty')).toBeNull();
  });

  it('increments on a second add and totals correctly', () => {
    render(<solution.Cart catalogue={catalogue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    expect(screen.getByText(/Widget x2/)).toBeTruthy();
    const lines = screen.getAllByRole('listitem');
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toContain('$19.98');
    expect(screen.getByText('Total: $19.98')).toBeTruthy();
  });

  it('totals across several products', () => {
    render(<solution.Cart catalogue={catalogue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Gadget' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Total: $14.49')).toBeTruthy();
  });

  it('removes a line', () => {
    render(<solution.Cart catalogue={catalogue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Widget' }));
    expect(screen.getByText('Your cart is empty')).toBeTruthy();
    expect(screen.getByText('Total: $0.00')).toBeTruthy();
  });

  it('clears everything', () => {
    render(<solution.Cart catalogue={catalogue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Widget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Gadget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Your cart is empty')).toBeTruthy();
  });
});