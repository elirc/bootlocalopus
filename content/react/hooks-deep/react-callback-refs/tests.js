describe('useMergedRef', () => {
  it('feeds the node to object and function refs, then null on unmount', () => {
    const objectRef = React.createRef();
    const calls = [];
    function Box() {
      const merged = solution.useMergedRef(objectRef, (node) => calls.push(node));
      return <div ref={merged}>box</div>;
    }
    const { unmount } = render(<Box />);
    const node = screen.getByText('box');
    expect(objectRef.current).toBe(node);
    expect(calls[0]).toBe(node);
    unmount();
    expect(objectRef.current).toBeNull();
    expect(calls[calls.length - 1]).toBeNull();
  });

  it('skips null and undefined refs', () => {
    const objectRef = React.createRef();
    function Box() {
      const merged = solution.useMergedRef(null, objectRef, undefined);
      return <div ref={merged}>box</div>;
    }
    render(<Box />);
    expect(objectRef.current).toBe(screen.getByText('box'));
  });

  it('keeps its identity while the refs are the same', () => {
    const a = React.createRef();
    const b = () => {};
    const { result, rerender } = renderHook(({ x, y }) => solution.useMergedRef(x, y), { initialProps: { x: a, y: b } });
    const first = result.current;
    rerender({ x: a, y: b });
    expect(result.current).toBe(first);
    rerender({ x: React.createRef(), y: b });
    expect(result.current).not.toBe(first);
  });

  it('does not detach and re-attach on every render', () => {
    const calls = [];
    const stableFnRef = (node) => calls.push(node === null ? 'detach' : 'attach');
    function Box({ n }) {
      const own = React.useRef(null);
      const merged = solution.useMergedRef(own, stableFnRef);
      return <div ref={merged}>render {n}</div>;
    }
    const { rerender } = render(<Box n={1} />);
    rerender(<Box n={2} />);
    rerender(<Box n={3} />);
    expect(calls).toEqual(['attach']);
  });
});

describe('InlineEdit', () => {
  const editButton = () => screen.getByRole('button', { name: 'Edit' });
  const input = () => screen.getByRole('textbox', { name: 'Edit value' });

  it('does not move focus on mount', () => {
    render(<solution.InlineEdit value="Draft title" onSave={() => {}} />);
    expect(screen.getByText('Draft title')).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
  });

  it('focuses the input and selects its text when editing starts', () => {
    render(<solution.InlineEdit value="Draft title" onSave={() => {}} />);
    fireEvent.click(editButton());
    expect(input().value).toBe('Draft title');
    expect(document.activeElement).toBe(input());
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe('Draft title'.length);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('saves on Enter and returns focus to the Edit button', () => {
    const saved = [];
    render(<solution.InlineEdit value="Draft" onSave={(v) => saved.push(v)} />);
    fireEvent.click(editButton());
    fireEvent.change(input(), { target: { value: 'Final' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(saved).toEqual(['Final']);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(editButton());
  });

  it('cancels on Escape without saving and returns focus', () => {
    const saved = [];
    render(<solution.InlineEdit value="Draft" onSave={(v) => saved.push(v)} />);
    fireEvent.click(editButton());
    fireEvent.change(input(), { target: { value: 'Oops' } });
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(saved).toEqual([]);
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(document.activeElement).toBe(editButton());
  });

  it('starts each edit from the current value', () => {
    function Host() {
      const [title, setTitle] = React.useState('One');
      return <solution.InlineEdit value={title} onSave={setTitle} />;
    }
    render(<Host />);
    fireEvent.click(editButton());
    fireEvent.change(input(), { target: { value: 'Two' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.getByText('Two')).toBeTruthy();
    fireEvent.click(editButton());
    fireEvent.change(input(), { target: { value: 'Discarded' } });
    fireEvent.keyDown(input(), { key: 'Escape' });
    fireEvent.click(editButton());
    expect(input().value).toBe('Two');
  });

  it('keeps focus in the input while typing', () => {
    render(<solution.InlineEdit value="Draft" onSave={() => {}} />);
    fireEvent.click(editButton());
    fireEvent.change(input(), { target: { value: 'Dr' } });
    fireEvent.change(input(), { target: { value: 'Dra' } });
    expect(document.activeElement).toBe(input());
    expect(input().selectionStart).toBe(3);
  });
});
