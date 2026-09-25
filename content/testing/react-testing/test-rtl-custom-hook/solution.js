const setup = (initial = 0, options) => renderHook(() => solution.useUndoable(initial, options));

/** Runs each call in its own act, like separate user actions. */
function steps(result, ...calls) {
  for (const call of calls) act(() => { call(result.current); });
}

const state = (result) => ({ value: result.current.value, canUndo: result.current.canUndo, canRedo: result.current.canRedo });

describe('undo and redo', () => {
  it('walks back and forward through history, with matching flags', () => {
    const { result } = setup(0);
    expect(state(result)).toEqual({ value: 0, canUndo: false, canRedo: false });

    steps(result, (h) => h.set(1), (h) => h.set(2));
    expect(state(result)).toEqual({ value: 2, canUndo: true, canRedo: false });

    steps(result, (h) => h.undo());
    expect(state(result)).toEqual({ value: 1, canUndo: true, canRedo: true });

    steps(result, (h) => h.undo());
    expect(state(result)).toEqual({ value: 0, canUndo: false, canRedo: true });

    steps(result, (h) => h.redo(), (h) => h.redo());
    expect(state(result)).toEqual({ value: 2, canUndo: true, canRedo: false });
  });

  it('does nothing when there is nothing to undo or redo', () => {
    const { result } = setup('a');
    steps(result, (h) => h.undo(), (h) => h.redo());
    expect(state(result)).toEqual({ value: 'a', canUndo: false, canRedo: false });
  });

  it('a new set after undo throws away the redo branch', () => {
    const { result } = setup(0);
    steps(result, (h) => h.set(1), (h) => h.set(2), (h) => h.undo(), (h) => h.undo(), (h) => h.set(5));
    expect(state(result)).toEqual({ value: 5, canUndo: true, canRedo: false });
    steps(result, (h) => h.redo());
    expect(result.current.value).toBe(5);
    steps(result, (h) => h.undo());
    expect(result.current.value).toBe(0);
  });
});

describe('set', () => {
  it('applies updaters in order, even twice in one act', () => {
    const { result } = setup(10);
    act(() => {
      result.current.set((n) => n + 1);
      result.current.set((n) => n * 2);
    });
    expect(result.current.value).toBe(22);
  });

  it('ignores a set to the same value: no history entry', () => {
    const { result } = setup(0);
    steps(result, (h) => h.set(1), (h) => h.set(1), (h) => h.undo());
    expect(state(result)).toEqual({ value: 0, canUndo: false, canRedo: true });
  });
});

describe('limit and reset', () => {
  it('keeps only the newest `limit` undo steps', () => {
    const { result } = setup(0, { limit: 2 });
    steps(result, (h) => h.set(1), (h) => h.set(2), (h) => h.set(3));
    steps(result, (h) => h.undo(), (h) => h.undo(), (h) => h.undo());
    expect(state(result)).toEqual({ value: 1, canUndo: false, canRedo: true });
  });

  it('reset clears all history', () => {
    const { result } = setup(0);
    steps(result, (h) => h.set(1), (h) => h.set(2), (h) => h.undo(), (h) => h.reset(9));
    expect(state(result)).toEqual({ value: 9, canUndo: false, canRedo: false });
    steps(result, (h) => h.undo());
    expect(result.current.value).toBe(9);
  });
});

describe('identity', () => {
  it('keeps the same functions across renders and updates', () => {
    const { result, rerender } = setup(0);
    const first = result.current;
    steps(result, (h) => h.set(1), (h) => h.undo());
    rerender();
    for (const name of ['set', 'undo', 'redo', 'reset']) {
      expect(result.current[name]).toBe(first[name]);
    }
  });
});
