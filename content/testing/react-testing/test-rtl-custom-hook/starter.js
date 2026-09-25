// renderHook and act are globals. Read values from result.current after every act.

describe('useUndoable', () => {
  it('sets and undoes', () => {
    const { result } = renderHook(() => solution.useUndoable(0));
    act(() => { result.current.set(1); });
    act(() => { result.current.undo(); });
    expect(result.current.value).toBe(0);
  });

  // TODO: redo, a set after undo (what happens to redo?), updaters twice in one act,
  // no-op sets, the limit, reset, canUndo/canRedo, and stable functions.
});
