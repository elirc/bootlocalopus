const { useUnsavedChangesGuard, NoteEditor } = solution;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Dispatches a cancelable beforeunload and reports whether it was blocked. */
function tryToLeave() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function confirmSpy(answer = true) {
  const asked = [];
  const confirm = (text) => { asked.push(text); return typeof answer === 'function' ? answer() : answer; };
  return { asked, confirm };
}

describe('useUnsavedChangesGuard: beforeunload', () => {
  it('blocks leaving only while there are unsaved changes', () => {
    const { rerender } = renderHook(({ when }) => useUnsavedChangesGuard(when), { initialProps: { when: false } });
    expect(tryToLeave()).toBe(false);
    rerender({ when: true });
    expect(tryToLeave()).toBe(true);
    rerender({ when: false });
    expect(tryToLeave()).toBe(false);
  });

  it('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => useUnsavedChangesGuard(true));
    expect(tryToLeave()).toBe(true);
    unmount();
    expect(tryToLeave()).toBe(false);
  });

  it('registers no listener at all while clean', () => {
    const added = [];
    const original = window.addEventListener;
    window.addEventListener = function (type, ...rest) {
      if (type === 'beforeunload') added.push(type);
      return original.call(this, type, ...rest);
    };
    try {
      const { rerender } = renderHook(({ when }) => useUnsavedChangesGuard(when), { initialProps: { when: false } });
      rerender({ when: false });
      expect(added).toEqual([]);
    } finally {
      window.addEventListener = original;
    }
  });
});

describe('useUnsavedChangesGuard: guard(action)', () => {
  it('runs the action straight away when clean, without asking', () => {
    const { asked, confirm } = confirmSpy(false);
    const { result } = renderHook(() => useUnsavedChangesGuard(false, { confirm }));
    let ran = 0;
    expect(result.current(() => { ran++; })).toBe(true);
    expect(ran).toBe(1);
    expect(asked).toEqual([]);
  });

  it('asks with the default message when dirty, and respects the answer', () => {
    let answer = false;
    const { asked, confirm } = confirmSpy(() => answer);
    const { result } = renderHook(() => useUnsavedChangesGuard(true, { confirm }));
    let ran = 0;
    expect(result.current(() => { ran++; })).toBe(false);
    expect(ran).toBe(0);
    answer = true;
    expect(result.current(() => { ran++; })).toBe(true);
    expect(ran).toBe(1);
    expect(asked).toEqual([
      'You have unsaved changes. Leave anyway?',
      'You have unsaved changes. Leave anyway?',
    ]);
  });

  it('uses a custom message', () => {
    const { asked, confirm } = confirmSpy(true);
    const { result } = renderHook(() => useUnsavedChangesGuard(true, { confirm, message: 'Discard this draft?' }));
    result.current(() => {});
    expect(asked).toEqual(['Discard this draft?']);
  });

  it('falls back to window.confirm', () => {
    const original = window.confirm;
    const asked = [];
    window.confirm = (text) => { asked.push(text); return false; };
    try {
      const { result } = renderHook(() => useUnsavedChangesGuard(true));
      expect(result.current(() => {})).toBe(false);
      expect(asked).toEqual(['You have unsaved changes. Leave anyway?']);
    } finally {
      window.confirm = original;
    }
  });

  it('keeps one identity and always reads the latest values', () => {
    const first = confirmSpy(true);
    const second = confirmSpy(false);
    const { result, rerender } = renderHook(
      ({ when, confirm }) => useUnsavedChangesGuard(when, { confirm }),
      { initialProps: { when: false, confirm: first.confirm } },
    );
    const guard = result.current;
    rerender({ when: true, confirm: second.confirm });
    expect(result.current).toBe(guard);
    let ran = 0;
    // The first guard object, called after the re-render, must see when=true
    // and the second confirm.
    expect(guard(() => { ran++; })).toBe(false);
    expect(ran).toBe(0);
    expect(first.asked).toEqual([]);
    expect(second.asked).toHaveLength(1);
  });
});

describe('NoteEditor', () => {
  function setup({ answer = false, save } = {}) {
    const spy = confirmSpy(() => answer);
    const closed = [];
    const saved = [];
    render(
      <NoteEditor
        note="Buy milk"
        confirm={spy.confirm}
        onClose={() => closed.push(true)}
        onSave={(text) => { saved.push(text); return save ? save() : Promise.resolve(); }}
      />,
    );
    return { asked: spy.asked, closed, saved };
  }
  const note = () => screen.getByLabelText('Note');
  const type = (value) => fireEvent.change(note(), { target: { value } });
  const click = (name) => fireEvent.click(screen.getByRole('button', { name }));

  it('closes without asking when nothing changed', () => {
    const { asked, closed } = setup();
    expect(note().value).toBe('Buy milk');
    click('Close');
    expect(asked).toEqual([]);
    expect(closed).toHaveLength(1);
    expect(tryToLeave()).toBe(false);
  });

  it('asks before closing with unsaved changes, and stays open on cancel', () => {
    const { asked, closed } = setup({ answer: false });
    type('Buy milk and eggs');
    expect(tryToLeave()).toBe(true);
    click('Close');
    expect(asked).toHaveLength(1);
    expect(closed).toHaveLength(0);
  });

  it('closes when the user confirms', () => {
    const { closed } = setup({ answer: true });
    type('Buy milk and eggs');
    click('Close');
    expect(closed).toHaveLength(1);
  });

  it('is clean again when the text is put back', () => {
    const { asked } = setup();
    type('Buy milk and eggs');
    type('Buy milk');
    click('Close');
    expect(asked).toEqual([]);
    expect(tryToLeave()).toBe(false);
  });

  it('stops guarding once the changes are saved', async () => {
    const { asked, closed, saved } = setup();
    type('Buy milk and eggs');
    await act(async () => { click('Save'); });
    expect(saved).toEqual(['Buy milk and eggs']);
    expect(tryToLeave()).toBe(false);
    click('Close');
    expect(asked).toEqual([]);
    expect(closed).toHaveLength(1);
  });

  it('keeps guarding text typed while the save was in flight', async () => {
    const d = deferred();
    const { asked } = setup({ save: () => d.promise });
    type('Buy milk and eggs');
    click('Save');
    type('Buy milk, eggs and bread');
    await act(async () => { d.resolve(); });
    expect(tryToLeave()).toBe(true);
    click('Close');
    expect(asked).toHaveLength(1);
  });

  it('keeps guarding after a failed save', async () => {
    const d = deferred();
    setup({ save: () => d.promise });
    type('Buy milk and eggs');
    click('Save');
    await act(async () => { d.reject(new Error('offline')); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(tryToLeave()).toBe(true);
  });
});
