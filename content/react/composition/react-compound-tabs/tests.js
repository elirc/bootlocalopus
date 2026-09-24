const Example = ({ defaultValue = 'a' }) => (
  <solution.Tabs defaultValue={defaultValue}>
    <solution.Tabs.List>
      <solution.Tabs.Tab value="a">First</solution.Tabs.Tab>
      <solution.Tabs.Tab value="b">Second</solution.Tabs.Tab>
      <solution.Tabs.Tab value="c">Third</solution.Tabs.Tab>
    </solution.Tabs.List>
    <solution.Tabs.Panel value="a">First panel</solution.Tabs.Panel>
    <solution.Tabs.Panel value="b">Second panel</solution.Tabs.Panel>
    <solution.Tabs.Panel value="c">Third panel</solution.Tabs.Panel>
  </solution.Tabs>
);

describe('Tabs', () => {
  it('renders a tablist with a tab per child', () => {
    render(<Example />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('shows only the default panel', () => {
    render(<Example />);
    expect(screen.getByText('First panel')).toBeTruthy();
    expect(screen.queryByText('Second panel')).toBeNull();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('honours defaultValue', () => {
    render(<Example defaultValue="c" />);
    expect(screen.getByText('Third panel')).toBeTruthy();
    expect(screen.queryByText('First panel')).toBeNull();
  });

  it('marks the active tab with aria-selected', () => {
    render(<Example />);
    const [first, second] = screen.getAllByRole('tab');
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(second.getAttribute('aria-selected')).toBe('false');
  });

  it('switches panels on click', () => {
    render(<Example />);
    fireEvent.click(screen.getByRole('tab', { name: 'Second' }));
    expect(screen.getByText('Second panel')).toBeTruthy();
    expect(screen.queryByText('First panel')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Second' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'First' }).getAttribute('aria-selected')).toBe('false');
  });

  it('lets the consumer arrange the markup freely', () => {
    render(
      <solution.Tabs defaultValue="x">
        <header>
          <h1>Settings</h1>
          <solution.Tabs.List>
            <solution.Tabs.Tab value="x">X</solution.Tabs.Tab>
          </solution.Tabs.List>
        </header>
        <main>
          <solution.Tabs.Panel value="x">X content</solution.Tabs.Panel>
        </main>
      </solution.Tabs>,
    );
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByText('X content')).toBeTruthy();
  });

  it('throws a helpful error when used outside Tabs', () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(() => render(<solution.Tabs.Tab value="a">Orphan</solution.Tabs.Tab>))
        .toThrow('must be used inside <Tabs>');
      expect(() => render(<solution.Tabs.Panel value="a">Orphan</solution.Tabs.Panel>))
        .toThrow('must be used inside <Tabs>');
      expect(() => render(<solution.Tabs.List>Orphan</solution.Tabs.List>))
        .toThrow('must be used inside <Tabs>');
    } finally {
      console.error = quiet;
    }
  });
});