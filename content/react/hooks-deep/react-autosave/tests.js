// A hand-driven scheduler: no wall clock anywhere.
function createScheduler() {
  const tasks = [];
  const schedule = (fn, ms) => {
    const task = { fn, ms, cancelled: false, fired: false };
    tasks.push(task);
    return () => { task.cancelled = true; };
  };
  schedule.calls = () => tasks.length;
  schedule.live = () => tasks.filter((t) => !t.cancelled && !t.fired);
  // Run every live timer, inside act so React flushes.
  schedule.fire = () => {
    act(() => {
      for (const t of schedule.live()) { t.fired = true; t.fn(); }
    });
  };
  return schedule;
}

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

// save() that hands back a deferred per call, so tests decide when each settles.
function createSave() {
  const calls = [];
  const save = (value) => {
    const d = deferred();
    calls.push({ value, ...d });
    return d.promise;
  };
  save.calls = calls;
  save.values = () => calls.map((c) => c.value);
  return save;
}

const settle = async (fn) => { await act(async () => { fn(); }); };

function setup({ initial = 'a', delay, strict = false } = {}) {
  const schedule = createScheduler();
  const save = createSave();
  const options = delay === undefined ? { schedule } : { delay, schedule };
  const hook = renderHook(({ value, save: s }) => solution.useAutosave(value, s, options), {
    initialProps: { value: initial, save },
    wrapper: strict ? ({ children }) => <React.StrictMode>{children}</React.StrictMode> : undefined,
  });
  const change = (value, s = save) => hook.rerender({ value, save: s });
  return { ...hook, schedule, save, change };
}

describe('useAutosave', () => {
  it('starts idle and saves nothing on mount', () => {
    const { result, schedule, save } = setup();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(schedule.calls()).toBe(0);
    expect(save.calls).toHaveLength(0);
  });

  it('marks a change pending, saves after the delay, then reports saved', async () => {
    const { result, schedule, save, change } = setup({ delay: 300 });
    change('ab');
    expect(result.current.status).toBe('pending');
    expect(schedule.live().map((t) => t.ms)).toEqual([300]);
    expect(save.calls).toHaveLength(0);
    schedule.fire();
    expect(save.values()).toEqual(['ab']);
    expect(result.current.status).toBe('saving');
    await settle(() => save.calls[0].resolve());
    expect(result.current.status).toBe('saved');
  });

  it('defaults the delay to 1000 ms', () => {
    const { schedule, change } = setup();
    change('b');
    expect(schedule.live().map((t) => t.ms)).toEqual([1000]);
  });

  it('debounces: several quick changes produce one save of the last value', () => {
    const { schedule, save, change } = setup();
    change('ab');
    change('abc');
    change('abcd');
    expect(schedule.live()).toHaveLength(1);
    schedule.fire();
    expect(save.values()).toEqual(['abcd']);
  });

  it('does not restart the timer when only the save function changes', () => {
    const { schedule, save, change } = setup();
    change('b');
    const newer = createSave();
    change('b', newer);
    change('b', newer);
    expect(schedule.calls()).toBe(1);
    schedule.fire();
    expect(save.calls).toHaveLength(0);
    expect(newer.values()).toEqual(['b']);
  });

  it('skips the save when the value is changed back before the timer fires', () => {
    const { result, schedule, save, change } = setup();
    change('ab');
    change('a');
    schedule.fire();
    expect(save.calls).toHaveLength(0);
    expect(result.current.status).toBe('idle');
  });

  it('never runs two saves at once, and saves the latest value after the first finishes', async () => {
    const { result, schedule, save, change } = setup();
    change('b');
    schedule.fire();
    change('c');
    expect(result.current.status).toBe('saving');
    change('d');
    schedule.fire();
    expect(save.values()).toEqual(['b']);

    await settle(() => save.calls[0].resolve());
    expect(save.values()).toEqual(['b', 'd']);
    expect(result.current.status).toBe('saving');

    await settle(() => save.calls[1].resolve());
    expect(result.current.status).toBe('saved');
  });

  it('goes back to pending, not saved, when the value moved on during a save', async () => {
    const { result, schedule, save, change } = setup();
    change('b');
    schedule.fire();
    change('c');
    await settle(() => save.calls[0].resolve());
    expect(result.current.status).toBe('pending');
    schedule.fire();
    expect(save.values()).toEqual(['b', 'c']);
  });

  it('reports a failed save, then recovers on the next change', async () => {
    const { result, schedule, save, change } = setup();
    change('b');
    schedule.fire();
    const boom = new Error('offline');
    await settle(() => save.calls[0].reject(boom));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(boom);

    change('bc');
    expect(result.current.status).toBe('pending');
    schedule.fire();
    expect(result.current.error).toBeNull();
    await settle(() => save.calls[1].resolve());
    expect(result.current.status).toBe('saved');
    expect(save.values()).toEqual(['b', 'bc']);
  });

  it('flush() saves immediately and cancels the timer', async () => {
    const { result, schedule, save, change } = setup();
    change('b');
    act(() => result.current.flush());
    expect(save.values()).toEqual(['b']);
    expect(schedule.live()).toHaveLength(0);
    schedule.fire();
    expect(save.calls).toHaveLength(1);
  });

  it('flush() with nothing unsaved does not call save', () => {
    const { result, save } = setup();
    act(() => result.current.flush());
    expect(save.calls).toHaveLength(0);
  });

  it('flush() retries the value whose save failed', async () => {
    const { result, schedule, save, change } = setup();
    change('b');
    schedule.fire();
    await settle(() => save.calls[0].reject(new Error('offline')));
    act(() => result.current.flush());
    expect(save.values()).toEqual(['b', 'b']);
  });

  it('keeps flush stable across renders', () => {
    const { result, change } = setup();
    const first = result.current.flush;
    change('b');
    change('c');
    expect(result.current.flush).toBe(first);
  });

  it('saves unsaved changes on unmount, once, with the latest save', () => {
    const { unmount, save, change, schedule } = setup();
    change('b');
    const newer = createSave();
    change('bc', newer);
    unmount();
    expect(save.calls).toHaveLength(0);
    expect(newer.values()).toEqual(['bc']);
    expect(schedule.live()).toHaveLength(0);
  });

  it('does not save on unmount when nothing changed, or when that value is already being saved', () => {
    const clean = setup();
    clean.unmount();
    expect(clean.save.calls).toHaveLength(0);

    const busy = setup();
    busy.change('b');
    busy.schedule.fire();
    busy.unmount();
    expect(busy.save.values()).toEqual(['b']);
  });

  it('does not save on mount under StrictMode, and saves once per change', async () => {
    const { schedule, save, change } = setup({ strict: true });
    expect(save.calls).toHaveLength(0);
    expect(schedule.live()).toHaveLength(0);
    change('b');
    schedule.fire();
    expect(save.values()).toEqual(['b']);
  });
});

describe('NoteEditor', () => {
  const note = () => screen.getByRole('textbox', { name: 'Note' });
  const status = () => screen.getByRole('status').textContent;

  it('shows each status as the user types and saves', async () => {
    const schedule = createScheduler();
    const save = createSave();
    render(<solution.NoteEditor initialText="Hi" save={save} schedule={schedule} />);
    expect(note().value).toBe('Hi');
    expect(status()).toBe('');
    fireEvent.change(note(), { target: { value: 'Hi there' } });
    expect(status()).toBe('Unsaved changes');
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
    expect(status()).toBe('Saving…');
    expect(save.values()).toEqual(['Hi there']);
    await settle(() => save.calls[0].resolve());
    expect(status()).toBe('Saved');
  });

  it('shows the error message when a save fails', async () => {
    const schedule = createScheduler();
    const save = createSave();
    render(<solution.NoteEditor initialText="" save={save} schedule={schedule} />);
    fireEvent.change(note(), { target: { value: 'x' } });
    schedule.fire();
    await settle(() => save.calls[0].reject(new Error('offline')));
    expect(status()).toBe('Save failed: offline');
  });
});
