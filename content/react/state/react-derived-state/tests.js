const ada = { first: 'Ada', last: 'Lovelace', verified: true };
const bob = { first: 'Bob', last: 'Brown', verified: false };

describe('UserCard', () => {
  it('renders the full name, count and status', () => {
    render(<solution.UserCard user={ada} items={[1, 2, 3]} />);
    expect(screen.getByRole('heading').textContent).toBe('Ada Lovelace');
    expect(screen.getByText('3 items')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
  });

  it('pluralises correctly', () => {
    const { rerender } = render(<solution.UserCard user={ada} items={[1]} />);
    expect(screen.getByText('1 item')).toBeTruthy();
    rerender(<solution.UserCard user={ada} items={[]} />);
    expect(screen.getByText('0 items')).toBeTruthy();
  });

  it('updates the name when the user prop changes', () => {
    const { rerender } = render(<solution.UserCard user={ada} items={[]} />);
    expect(screen.getByRole('heading').textContent).toBe('Ada Lovelace');
    rerender(<solution.UserCard user={bob} items={[]} />);
    expect(screen.getByRole('heading').textContent).toBe('Bob Brown');
  });

  it('updates the count when the items prop changes', () => {
    const { rerender } = render(<solution.UserCard user={ada} items={[1, 2]} />);
    expect(screen.getByText('2 items')).toBeTruthy();
    rerender(<solution.UserCard user={ada} items={[1, 2, 3, 4]} />);
    expect(screen.getByText('4 items')).toBeTruthy();
  });

  it('commits once per prop change, with no catch-up render from an effect', () => {
    // RTL's render() flushes effects, so the final DOM of an effect-synced
    // version looks right. The commit count does not: the effect's setState
    // forces a second commit, the first of which showed stale data.
    const commits = [];
    const onRender = (id, phase) => commits.push(phase);
    const card = (items) => (
      <React.Profiler id="card" onRender={onRender}>
        <solution.UserCard user={ada} items={items} />
      </React.Profiler>
    );
    const { rerender } = render(card([1, 2, 3]));
    expect(screen.getByText('3 items')).toBeTruthy();
    expect(commits).toEqual(['mount']);
    rerender(card([1, 2]));
    expect(screen.getByText('2 items')).toBeTruthy();
    expect(commits).toEqual(['mount', 'update']);
  });

  it('updates status with the prop', () => {
    const { rerender } = render(<solution.UserCard user={ada} items={[]} />);
    expect(screen.getByText('Verified')).toBeTruthy();
    rerender(<solution.UserCard user={bob} items={[]} />);
    expect(screen.getByText('Unverified')).toBeTruthy();
    expect(screen.queryByText('Verified')).toBeNull();
  });
});