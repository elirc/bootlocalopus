const { createTypeahead } = solution;

function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout: (fn, ms) => { const id = nextId++; pending.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: (id) => { pending.delete(id); },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...pending].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
    get size() { return pending.size; },
  };
}

/** A controllable search. `respectAbort` makes it reject with an AbortError like fetch. */
function fakeSearch({ respectAbort = true } = {}) {
  const calls = [];
  const search = (query, { signal }) => new Promise((resolve, reject) => {
    calls.push({ query, signal, resolve, reject });
    if (respectAbort) {
      signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    }
  });
  return { search, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(opts = {}) {
  const timers = fakeTimers();
  const { search, calls } = fakeSearch(opts);
  const states = [];
  const ta = createTypeahead({
    search, render: (s) => states.push(s), delayMs: opts.delayMs ?? 250,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
  });
  return { ta, timers, calls, states };
}

describe('debouncing', () => {
  it('waits for a pause and searches once, for the last text', () => {
    const { ta, timers, calls, states } = setup();
    ta.input('l'); timers.advance(100);
    ta.input('la'); timers.advance(100);
    ta.input('lap '); timers.advance(249);
    expect(calls).toHaveLength(0);
    expect(states).toEqual([]);
    timers.advance(1);
    expect(calls.map((c) => c.query)).toEqual(['lap']);
    expect(states).toEqual([{ status: 'loading', query: 'lap', results: [] }]);
  });

  it('uses delayMs and the injected timers', () => {
    const { ta, timers, calls } = setup({ delayMs: 400 });
    ta.input('mug');
    timers.advance(399);
    expect(calls).toHaveLength(0);
    timers.advance(1);
    expect(calls).toHaveLength(1);
  });
});

describe('results', () => {
  it('renders success, and keeps the shown results while the next query loads', async () => {
    const { ta, timers, calls, states } = setup();
    ta.input('mug'); timers.advance(250);
    calls[0].resolve(['Mug', 'Mug XL']);
    await flush();
    ta.input('mugs'); timers.advance(250);
    expect(states).toEqual([
      { status: 'loading', query: 'mug', results: [] },
      { status: 'success', query: 'mug', results: ['Mug', 'Mug XL'] },
      { status: 'loading', query: 'mugs', results: ['Mug', 'Mug XL'] },
    ]);
    calls[1].resolve([]);
    await flush();
    expect(states[3]).toEqual({ status: 'success', query: 'mugs', results: [] });
  });

  it('renders a real failure as an error state', async () => {
    const { ta, timers, calls, states } = setup();
    ta.input('mug'); timers.advance(250);
    const boom = new Error('503');
    calls[0].reject(boom);
    await flush();
    expect(states[1]).toEqual({ status: 'error', query: 'mug', results: [], error: boom });
    expect(states[1].error).toBe(boom);
  });
});

describe('races', () => {
  it('aborts the previous request and never renders it or its AbortError', async () => {
    const { ta, timers, calls, states } = setup();
    ta.input('lap'); timers.advance(250);
    ta.input('laptop'); timers.advance(250);
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].signal.aborted).toBe(false);
    await flush();
    calls[1].resolve(['Laptop']);
    await flush();
    expect(states).toEqual([
      { status: 'loading', query: 'lap', results: [] },
      { status: 'loading', query: 'laptop', results: [] },
      { status: 'success', query: 'laptop', results: ['Laptop'] },
    ]);
  });

  it('drops a stale response even when search ignores the signal', async () => {
    const { ta, timers, calls, states } = setup({ respectAbort: false });
    ta.input('lap'); timers.advance(250);
    ta.input('laptop'); timers.advance(250);
    calls[1].resolve(['Laptop']);
    await flush();
    calls[0].resolve(['Lapland', 'Lapel']);
    await flush();
    expect(states[states.length - 1]).toEqual({ status: 'success', query: 'laptop', results: ['Laptop'] });
    expect(states.filter((s) => s.query === 'lap' && s.status !== 'loading')).toEqual([]);
  });

  it('drops a stale failure too', async () => {
    const { ta, timers, calls, states } = setup({ respectAbort: false });
    ta.input('lap'); timers.advance(250);
    ta.input('laptop'); timers.advance(250);
    calls[0].reject(new Error('late failure'));
    await flush();
    expect(states.some((s) => s.status === 'error')).toBe(false);
  });
});

describe('clearing and repeats', () => {
  it('clears immediately on empty input and aborts the request', async () => {
    const { ta, timers, calls, states } = setup({ respectAbort: false });
    ta.input('lap'); timers.advance(250);
    ta.input('   ');
    expect(states[states.length - 1]).toEqual({ status: 'idle', query: '', results: [] });
    expect(calls[0].signal.aborted).toBe(true);
    calls[0].resolve(['Lapland']);
    await flush();
    expect(states[states.length - 1]).toEqual({ status: 'idle', query: '', results: [] });
  });

  it('clearing cancels a pending search', () => {
    const { ta, timers, calls, states } = setup();
    ta.input('mug'); timers.advance(250);
    ta.input('mugs');
    ta.input('');
    timers.advance(1000);
    expect(calls.map((c) => c.query)).toEqual(['mug']);
    expect(states[states.length - 1].status).toBe('idle');
  });

  it('does nothing for whitespace before anything was typed', () => {
    const { ta, timers, calls, states } = setup();
    ta.input('  ');
    timers.advance(1000);
    expect(calls).toHaveLength(0);
    expect(states).toEqual([]);
  });

  it('does not search again for the current query, and cancels the pending one', async () => {
    const { ta, timers, calls } = setup();
    ta.input('lap'); timers.advance(250);
    ta.input('lapt');
    timers.advance(100);
    ta.input(' lap ');
    timers.advance(1000);
    expect(calls.map((c) => c.query)).toEqual(['lap']);
    expect(calls[0].signal.aborted).toBe(false);
    expect(timers.size).toBe(0);
  });
});

describe('dispose', () => {
  it('cancels the timer, aborts the request and renders nothing more', async () => {
    const { ta, timers, calls, states } = setup({ respectAbort: false });
    ta.input('lap'); timers.advance(250);
    ta.input('laptop');
    const before = states.length;
    ta.dispose();
    timers.advance(1000);
    expect(calls).toHaveLength(1);
    expect(calls[0].signal.aborted).toBe(true);
    calls[0].resolve(['Lapland']);
    await flush();
    expect(states).toHaveLength(before);
  });
});
