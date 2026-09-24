describe('List', () => {
  it('renders one li per item using the render prop', () => {
    render(
      <solution.List items={[{ id: 1, name: 'a' }, { id: 2, name: 'b' }]}>
        {(item) => <span>{item.name.toUpperCase()}</span>}
      </solution.List>,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('A');
    expect(items[1].textContent).toBe('B');
  });

  it('passes the index too', () => {
    render(
      <solution.List items={['x', 'y']}>
        {(item, index) => <span>{index}:{item}</span>}
      </solution.List>,
    );
    expect(screen.getByText('0:x')).toBeTruthy();
    expect(screen.getByText('1:y')).toBeTruthy();
  });

  it('renders the default empty state with no ul', () => {
    const { container } = render(<solution.List items={[]}>{(i) => i}</solution.List>);
    expect(screen.getByText('Nothing here')).toBeTruthy();
    expect(container.querySelector('ul')).toBeNull();
  });

  it('renders a custom empty state', () => {
    render(
      <solution.List items={[]} empty={<div>No results for your search</div>}>
        {(i) => i}
      </solution.List>,
    );
    expect(screen.getByText('No results for your search')).toBeTruthy();
    expect(screen.queryByText('Nothing here')).toBeNull();
  });
});

describe('Toggle', () => {
  it('hands state and a toggle to the consumer', () => {
    render(
      <solution.Toggle>
        {({ on, toggle }) => (
          <button onClick={toggle}>{on ? 'ON' : 'OFF'}</button>
        )}
      </solution.Toggle>,
    );
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('OFF');
    fireEvent.click(button);
    expect(button.textContent).toBe('ON');
    fireEvent.click(button);
    expect(button.textContent).toBe('OFF');
  });

  it('accepts an initial value', () => {
    render(<solution.Toggle initial>{({ on }) => <span>{String(on)}</span>}</solution.Toggle>);
    expect(screen.getByText('true')).toBeTruthy();
  });

  it('lets the consumer render anything', () => {
    render(
      <solution.Toggle>
        {({ on, toggle }) => (
          <div>
            <input type="checkbox" checked={on} onChange={toggle} aria-label="Enabled" />
            {on && <p>Extra options</p>}
          </div>
        )}
      </solution.Toggle>,
    );
    expect(screen.queryByText('Extra options')).toBeNull();
    fireEvent.click(screen.getByLabelText('Enabled'));
    expect(screen.getByText('Extra options')).toBeTruthy();
  });
});

describe('Resource', () => {
  it('reports loading, then success', async () => {
    const load = async () => ['a', 'b'];
    render(
      <solution.Resource load={load}>
        {({ status, data }) => (status === 'loading' ? <p>Loading</p> : <p>{data.join(',')}</p>)}
      </solution.Resource>,
    );
    expect(screen.getByText('Loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('a,b')).toBeTruthy());
  });

  it('reports errors', async () => {
    const load = async () => { throw new Error('nope'); };
    render(
      <solution.Resource load={load}>
        {({ status, error }) => <p>{status === 'error' ? 'failed: ' + error.message : status}</p>}
      </solution.Resource>,
    );
    await waitFor(() => expect(screen.getByText('failed: nope')).toBeTruthy());
  });

  it('composes with List for the whole loading-to-list flow', async () => {
    const load = async () => [{ id: 1, name: 'ada' }];
    render(
      <solution.Resource load={load}>
        {({ status, data }) =>
          status === 'success'
            ? <solution.List items={data}>{(u) => <span>{u.name}</span>}</solution.List>
            : <p>…</p>
        }
      </solution.Resource>,
    );
    await waitFor(() => expect(screen.getByText('ada')).toBeTruthy());
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('loads once, even when the parent re-renders with a new inline load', async () => {
    let calls = 0;
    function Parent() {
      const [n, setN] = React.useState(0);
      return (
        <div>
          <button onClick={() => setN((x) => x + 1)}>rerender {n}</button>
          <solution.Resource load={async () => { calls++; return 'data'; }}>
            {({ status }) => <p>status: {status}</p>}
          </solution.Resource>
        </div>
      );
    }
    render(<Parent />);
    await waitFor(() => expect(screen.getByText('status: success')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /rerender/ }));
    fireEvent.click(screen.getByRole('button', { name: /rerender/ }));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(1);
    expect(screen.getByText('status: success')).toBeTruthy();
  });
});