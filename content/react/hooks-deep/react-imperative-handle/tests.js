const box = () => screen.getByRole('searchbox');

describe('SearchInput', () => {
  it('renders a labelled search box that reports typing', () => {
    const seen = [];
    render(<solution.SearchInput label="Search orders" onValueChange={(v) => seen.push(v)} />);
    expect(screen.getByLabelText('Search orders')).toBe(box());
    expect(box().value).toBe('');
    fireEvent.change(box(), { target: { value: 'invoice' } });
    expect(box().value).toBe('invoice');
    expect(seen).toEqual(['invoice']);
  });

  it('gives an object ref a handle with exactly focus and clear', () => {
    const ref = React.createRef();
    render(<solution.SearchInput label="Search" ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current instanceof window.HTMLElement).toBe(false);
    expect(Object.keys(ref.current).sort()).toEqual(['clear', 'focus']);
  });

  it('focus() focuses the input', () => {
    const ref = React.createRef();
    render(<div><button>elsewhere</button><solution.SearchInput label="Search" ref={ref} /></div>);
    screen.getByRole('button').focus();
    act(() => ref.current.focus());
    expect(document.activeElement).toBe(box());
  });

  it('clear() empties the input, reports it and focuses', () => {
    const ref = React.createRef();
    const seen = [];
    render(<div><button>elsewhere</button><solution.SearchInput label="Search" ref={ref} onValueChange={(v) => seen.push(v)} /></div>);
    fireEvent.change(box(), { target: { value: 'abc' } });
    screen.getByRole('button').focus();
    act(() => ref.current.clear());
    expect(box().value).toBe('');
    expect(seen).toEqual(['abc', '']);
    expect(document.activeElement).toBe(box());
  });

  it('clear() calls the latest onValueChange', () => {
    const ref = React.createRef();
    const calls = [];
    const { rerender } = render(<solution.SearchInput label="Search" ref={ref} onValueChange={() => calls.push('old')} />);
    rerender(<solution.SearchInput label="Search" ref={ref} onValueChange={() => calls.push('new')} />);
    act(() => ref.current.clear());
    expect(calls).toEqual(['new']);
  });

  it('works with a function ref, which receives null on unmount', () => {
    const received = [];
    const { unmount } = render(<solution.SearchInput label="Search" ref={(h) => received.push(h)} />);
    const handle = received.find((h) => h !== null);
    expect(typeof handle.clear).toBe('function');
    expect(typeof handle.focus).toBe('function');
    unmount();
    expect(received[received.length - 1]).toBeNull();
  });

  it('lets a parent button reset the search', () => {
    function Filters() {
      const search = React.useRef(null);
      const [query, setQuery] = React.useState('');
      return (
        <div>
          <solution.SearchInput label="Search" ref={search} onValueChange={setQuery} />
          <button onClick={() => search.current.clear()}>Reset filters</button>
          <p data-testid="query">{query}</p>
        </div>
      );
    }
    render(<Filters />);
    fireEvent.change(box(), { target: { value: 'late' } });
    expect(screen.getByTestId('query').textContent).toBe('late');
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getByTestId('query').textContent).toBe('');
    expect(box().value).toBe('');
  });
});
