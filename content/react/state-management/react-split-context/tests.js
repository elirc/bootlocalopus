const { ToastProvider, useToasts, useToastActions } = solution;

function Viewport() {
  const toasts = useToasts();
  const { dismiss } = useToastActions();
  return (
    <ul aria-label="Notifications">
      {toasts.map((t) => (
        <li key={t.id}>
          {t.message}
          <button onClick={() => dismiss(t.id)}>Dismiss {t.message}</button>
        </li>
      ))}
    </ul>
  );
}

const messages = () => within(screen.getByRole('list', { name: 'Notifications' }))
  .queryAllByRole('listitem')
  .map((li) => li.firstChild.textContent);

function setup() {
  const renders = { save: 0 };
  const seen = { actions: [], ids: [] };
  function SaveButton() {
    renders.save++;
    const actions = useToastActions();
    seen.actions.push(actions);
    return <button onClick={() => seen.ids.push(actions.show('Saved'))}>Save</button>;
  }
  render(
    <ToastProvider>
      <SaveButton />
      <Viewport />
    </ToastProvider>,
  );
  return { renders, seen };
}

describe('split toast context', () => {
  it('shows toasts in order and returns their ids', () => {
    const { seen } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(messages()).toEqual(['Saved', 'Saved']);
    expect(seen.ids).toHaveLength(2);
    expect(seen.ids[0]).not.toBe(seen.ids[1]);
    expect(seen.ids[0]).toBeDefined();
  });

  it('gives unique ids to toasts shown in the same handler', () => {
    const ids = [];
    function Burst() {
      const { show } = useToastActions();
      return <button onClick={() => { ids.push(show('a'), show('b'), show('c')); }}>Burst</button>;
    }
    render(<ToastProvider><Burst /><Viewport /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Burst' }));
    expect(messages()).toEqual(['a', 'b', 'c']);
    expect(new Set(ids).size).toBe(3);
  });

  it('dismisses by id, leaving the others', () => {
    let api;
    function Grab() { api = useToastActions(); return null; }
    render(<ToastProvider><Grab /><Viewport /></ToastProvider>);
    let first, second;
    act(() => { first = api.show('one'); second = api.show('two'); api.show('three'); });
    act(() => api.dismiss(second));
    expect(messages()).toEqual(['one', 'three']);
    act(() => api.dismiss(12345));
    expect(messages()).toEqual(['one', 'three']);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss one' }));
    expect(messages()).toEqual(['three']);
    expect(first).not.toBe(second);
  });

  it('applies several dismisses in one handler', () => {
    let api;
    function Grab() { api = useToastActions(); return null; }
    render(<ToastProvider><Grab /><Viewport /></ToastProvider>);
    let ids;
    act(() => { ids = [api.show('a'), api.show('b'), api.show('c')]; });
    act(() => { api.dismiss(ids[0]); api.dismiss(ids[2]); });
    expect(messages()).toEqual(['b']);
  });

  it('does not re-render action-only consumers when toasts change', () => {
    const { renders } = setup();
    const before = renders.save;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss Saved' })[0]);
    expect(messages()).toHaveLength(1);
    expect(renders.save).toBe(before);
  });

  it('returns the same actions object and functions on every render', () => {
    let api;
    const objects = [];
    function Grab({ n }) { api = useToastActions(); objects.push(api); return <span>{n}</span>; }
    function Host() {
      const [n, setN] = React.useState(0);
      return (
        <ToastProvider>
          <Grab n={n} />
          <button onClick={() => setN(n + 1)}>again</button>
        </ToastProvider>
      );
    }
    render(<Host />);
    act(() => { api.show('x'); });
    fireEvent.click(screen.getByRole('button', { name: 'again' }));
    fireEvent.click(screen.getByRole('button', { name: 'again' }));
    expect(objects.length).toBeGreaterThan(2);
    for (const o of objects) {
      expect(o).toBe(objects[0]);
      expect(o.show).toBe(objects[0].show);
      expect(o.dismiss).toBe(objects[0].dismiss);
    }
  });

  it('keeps separate providers independent', () => {
    let a, b;
    function GrabA() { a = useToastActions(); return null; }
    function GrabB() { b = useToastActions(); return null; }
    function Count({ label }) { return <p>{label}: {useToasts().length}</p>; }
    render(
      <div>
        <ToastProvider><GrabA /><Count label="A" /></ToastProvider>
        <ToastProvider><GrabB /><Count label="B" /></ToastProvider>
      </div>,
    );
    act(() => { a.show('only in A'); });
    expect(screen.getByText('A: 1')).toBeTruthy();
    expect(screen.getByText('B: 0')).toBeTruthy();
  });

  it('throws a helpful error outside a provider', () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(() => renderHook(() => useToasts())).toThrow('useToasts must be used within a ToastProvider');
      expect(() => renderHook(() => useToastActions())).toThrow('useToastActions must be used within a ToastProvider');
    } finally {
      console.error = original;
    }
  });
});
