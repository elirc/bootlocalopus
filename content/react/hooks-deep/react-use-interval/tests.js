// A hand-driven fake for setInterval/clearInterval: no wall clock anywhere.
let fake;
const realSet = globalThis.setInterval;
const realClear = globalThis.clearInterval;

function installFake() {
  const active = new Map();
  let nextId = 1;
  const f = {
    active,
    created: 0,
    cleared: 0,
    set(fn, ms) {
      const id = nextId++;
      active.set(id, { fn, ms });
      f.created++;
      return id;
    },
    clear(id) {
      if (active.delete(id)) f.cleared++;
    },
    delays: () => [...active.values()].map((t) => t.ms),
    // Fire every running interval once, inside act so React flushes.
    tick() {
      act(() => {
        for (const t of [...active.values()]) t.fn();
      });
    },
  };
  globalThis.setInterval = (fn, ms) => f.set(fn, ms);
  globalThis.clearInterval = (id) => f.clear(id);
  return f;
}

beforeEach(() => { fake = installFake(); });
afterEach(() => {
  cleanup();
  globalThis.setInterval = realSet;
  globalThis.clearInterval = realClear;
});

describe('useInterval', () => {
  it('calls the callback on every tick', () => {
    let calls = 0;
    renderHook(() => solution.useInterval(() => { calls++; }, 500));
    expect(fake.delays()).toEqual([500]);
    fake.tick();
    fake.tick();
    fake.tick();
    expect(calls).toBe(3);
  });

  it('calls the latest callback without recreating the interval', () => {
    const seen = [];
    const { rerender } = renderHook(({ label }) => solution.useInterval(() => seen.push(label), 100), {
      initialProps: { label: 'first' },
    });
    fake.tick();
    rerender({ label: 'second' });
    rerender({ label: 'third' });
    fake.tick();
    expect(seen).toEqual(['first', 'third']);
    expect(fake.created).toBe(1);
    expect(fake.cleared).toBe(0);
  });

  it('pauses when delay is null and resumes when it is a number again', () => {
    let calls = 0;
    const { rerender } = renderHook(({ delay }) => solution.useInterval(() => { calls++; }, delay), {
      initialProps: { delay: null },
    });
    expect(fake.active.size).toBe(0);
    rerender({ delay: 200 });
    expect(fake.delays()).toEqual([200]);
    fake.tick();
    rerender({ delay: null });
    expect(fake.active.size).toBe(0);
    fake.tick();
    expect(calls).toBe(1);
  });

  it('restarts with the new delay when delay changes', () => {
    const { rerender } = renderHook(({ delay }) => solution.useInterval(() => {}, delay), {
      initialProps: { delay: 100 },
    });
    rerender({ delay: 250 });
    expect(fake.delays()).toEqual([250]);
    expect(fake.created).toBe(2);
  });

  it('clears the interval on unmount', () => {
    const { unmount } = renderHook(() => solution.useInterval(() => {}, 100));
    expect(fake.active.size).toBe(1);
    unmount();
    expect(fake.active.size).toBe(0);
  });
});

describe('Countdown', () => {
  const timer = () => screen.getByRole('timer').textContent;

  it('counts down once per second tick', () => {
    render(<solution.Countdown from={3} onDone={() => {}} />);
    expect(timer()).toBe('3');
    expect(fake.delays()).toEqual([1000]);
    fake.tick();
    expect(timer()).toBe('2');
    fake.tick();
    expect(timer()).toBe('1');
  });

  it('pauses and resumes', () => {
    render(<solution.Countdown from={5} onDone={() => {}} />);
    fake.tick();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(fake.active.size).toBe(0);
    fake.tick();
    expect(timer()).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(fake.delays()).toEqual([1000]);
    fake.tick();
    expect(timer()).toBe('3');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('stops at zero and calls onDone exactly once', () => {
    let done = 0;
    render(<solution.Countdown from={2} onDone={() => { done++; }} />);
    fake.tick();
    fake.tick();
    expect(timer()).toBe('0');
    expect(fake.active.size).toBe(0);
    fake.tick();
    expect(timer()).toBe('0');
    expect(done).toBe(1);
  });

  it('is not restarted by a parent re-render with a new inline onDone', () => {
    let done = 0;
    function Parent() {
      const [n, setN] = React.useState(0);
      return (
        <div>
          <button onClick={() => setN(n + 1)}>parent {n}</button>
          <solution.Countdown from={2} onDone={() => { done++; }} />
        </div>
      );
    }
    render(<Parent />);
    fake.tick();
    fireEvent.click(screen.getByRole('button', { name: /parent/ }));
    fireEvent.click(screen.getByRole('button', { name: /parent/ }));
    expect(fake.created).toBe(1);
    expect(timer()).toBe('1');
    fake.tick();
    fireEvent.click(screen.getByRole('button', { name: /parent/ }));
    expect(done).toBe(1);
  });

  it('runs one interval and calls onDone once under StrictMode', () => {
    let done = 0;
    render(
      <React.StrictMode>
        <solution.Countdown from={1} onDone={() => { done++; }} />
      </React.StrictMode>,
    );
    expect(fake.active.size).toBe(1);
    fake.tick();
    expect(timer()).toBe('0');
    expect(done).toBe(1);
  });

  it('calls the latest onDone', () => {
    const calls = [];
    const { rerender } = render(<solution.Countdown from={1} onDone={() => calls.push('old')} />);
    rerender(<solution.Countdown from={1} onDone={() => calls.push('new')} />);
    fake.tick();
    expect(calls).toEqual(['new']);
  });
});
