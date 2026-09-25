const { useUndoable, Counter } = solution;

const hook = (initial = 'a', options) => renderHook(() => useUndoable(initial, options));

describe('useUndoable', () => {
  it('starts with no history', () => {
    const { result } = hook('a');
    expect(result.current.present).toBe('a');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('undoes and redoes', () => {
    const { result } = hook('a');
    act(() => result.current.set('b'));
    act(() => result.current.set('c'));
    act(() => result.current.undo());
    expect(result.current.present).toBe('b');
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.present).toBe('a');
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.redo());
    act(() => result.current.redo());
    expect(result.current.present).toBe('c');
    expect(result.current.canRedo).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });

  it('does nothing when there is nothing to undo or redo', () => {
    const { result } = hook('a');
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.present).toBe('a');
    act(() => result.current.set('b'));
    act(() => result.current.redo());
    expect(result.current.present).toBe('b');
    act(() => result.current.undo());
    act(() => result.current.undo());
    expect(result.current.present).toBe('a');
    act(() => result.current.redo());
    expect(result.current.present).toBe('b');
  });

  it('clears the future on a new change', () => {
    const { result } = hook('a');
    act(() => result.current.set('b'));
    act(() => result.current.undo());
    act(() => result.current.set('x'));
    expect(result.current.canRedo).toBe(false);
    act(() => result.current.redo());
    expect(result.current.present).toBe('x');
    act(() => result.current.undo());
    expect(result.current.present).toBe('a');
  });

  it('accepts an updater, and applies two in one handler as two entries', () => {
    const { result } = hook(0);
    act(() => {
      result.current.set((n) => n + 1);
      result.current.set((n) => n + 1);
    });
    expect(result.current.present).toBe(2);
    act(() => result.current.undo());
    expect(result.current.present).toBe(1);
    act(() => result.current.undo());
    expect(result.current.present).toBe(0);
  });

  it('ignores a set to the same value', () => {
    const { result } = hook('a');
    act(() => result.current.set('b'));
    act(() => result.current.set('b'));
    act(() => result.current.set((v) => v));
    act(() => result.current.undo());
    expect(result.current.present).toBe('a');
    expect(result.current.canUndo).toBe(false);
  });

  it('keeps no more than limit past entries, dropping the oldest', () => {
    const { result } = hook(0, { limit: 3 });
    for (let i = 1; i <= 6; i++) act(() => result.current.set(i));
    for (let i = 0; i < 10; i++) act(() => result.current.undo());
    expect(result.current.present).toBe(3);
    expect(result.current.canUndo).toBe(false);
  });

  it('defaults the limit to 100', () => {
    const { result } = hook(0);
    act(() => { for (let i = 1; i <= 150; i++) result.current.set(i); });
    act(() => { for (let i = 0; i < 200; i++) result.current.undo(); });
    expect(result.current.present).toBe(50);
  });

  it('reset clears the history', () => {
    const { result } = hook('a');
    act(() => result.current.set('b'));
    act(() => result.current.set('c'));
    act(() => result.current.undo());
    act(() => result.current.reset('z'));
    expect(result.current.present).toBe('z');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('returns stable functions', () => {
    const { result } = hook('a');
    const first = result.current;
    act(() => result.current.set('b'));
    act(() => result.current.undo());
    for (const name of ['set', 'undo', 'redo', 'reset']) expect(result.current[name]).toBe(first[name]);
  });

  it('keeps separate histories per hook instance', () => {
    const a = hook('a1');
    const b = hook('b1');
    act(() => a.result.current.set('a2'));
    expect(b.result.current.canUndo).toBe(false);
    expect(b.result.current.present).toBe('b1');
  });
});

describe('Counter', () => {
  const value = () => screen.getByRole('status').textContent;
  const btn = (name) => screen.getByRole('button', { name });

  it('counts, undoes and redoes, disabling what is not possible', () => {
    render(<Counter />);
    expect(value()).toBe('0');
    expect(btn('Undo').disabled).toBe(true);
    expect(btn('Redo').disabled).toBe(true);
    fireEvent.click(btn('+1'));
    fireEvent.click(btn('+1'));
    expect(value()).toBe('2');
    fireEvent.click(btn('Undo'));
    expect(value()).toBe('1');
    expect(btn('Redo').disabled).toBe(false);
    fireEvent.click(btn('Redo'));
    expect(value()).toBe('2');
    expect(btn('Redo').disabled).toBe(true);
    expect(btn('Undo').disabled).toBe(false);
  });
});
