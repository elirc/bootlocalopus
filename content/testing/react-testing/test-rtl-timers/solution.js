function fakeScheduler() {
  const timers = [];
  const schedule = (fn, ms) => {
    const timer = { fn, ms, cancelled: false, fired: false };
    timers.push(timer);
    return () => { timer.cancelled = true; };
  };
  const live = () => timers.filter((t) => !t.cancelled && !t.fired);
  const fireAll = () => act(() => {
    for (const t of live()) { t.fired = true; t.fn(); }
  });
  return { schedule, timers, live, fireAll };
}

/** Raises toasts with any message, the way app code would. */
function Triggers() {
  const notify = solution.useToast();
  const [n, setN] = React.useState(0);
  return (
    <div>
      <button onClick={() => { setN(n + 1); notify(`Saved ${n + 1}`); }}>info</button>
      <button onClick={() => notify('Payment failed', { kind: 'error' })}>error</button>
    </div>
  );
}

function setup() {
  const clock = fakeScheduler();
  const utils = render(<solution.ToastProvider schedule={clock.schedule}><Triggers /></solution.ToastProvider>);
  return { clock, ...utils };
}

const info = () => fireEvent.click(screen.getByRole('button', { name: 'info' }));
const error = () => fireEvent.click(screen.getByRole('button', { name: 'error' }));
const messages = () => [...screen.queryAllByRole('status'), ...screen.queryAllByRole('alert')].map((el) => el.textContent.replace('Dismiss', '').replace(/[×✕]/g, '').trim());
const toast = (text) => [...screen.queryAllByRole('status'), ...screen.queryAllByRole('alert')].find((el) => el.textContent.includes(text));

describe('auto-dismiss', () => {
  it('schedules an info toast for 5000 ms and removes it when that fires', () => {
    const { clock } = setup();
    info();
    expect(clock.live().map((t) => t.ms)).toEqual([5000]);
    expect(messages()).toEqual(['Saved 1']);

    clock.fireAll();
    expect(screen.queryByRole('status')).toBeNull();
    expect(clock.live()).toHaveLength(0);
  });

  it('never schedules an error toast: it stays', () => {
    const { clock } = setup();
    error();
    expect(clock.live()).toHaveLength(0);
    clock.fireAll();
    expect(screen.getByRole('alert').textContent).toContain('Payment failed');
  });
});

describe('dismissing', () => {
  it('Dismiss removes the toast and cancels its timer', () => {
    const { clock } = setup();
    info();
    fireEvent.click(within(toast('Saved 1')).getByRole('button', { name: 'Dismiss' }));
    expect(messages()).toEqual([]);
    expect(clock.live()).toHaveLength(0);
  });

  it('Dismiss closes an error toast', () => {
    setup();
    error();
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('hover', () => {
  it('pausing cancels the timer, leaving starts a fresh 5000 ms one', () => {
    const { clock } = setup();
    info();
    fireEvent.mouseEnter(toast('Saved 1'));
    expect(clock.live()).toHaveLength(0);
    clock.fireAll();
    expect(messages()).toEqual(['Saved 1']);

    fireEvent.mouseLeave(toast('Saved 1'));
    expect(clock.live().map((t) => t.ms)).toEqual([5000]);
    clock.fireAll();
    expect(messages()).toEqual([]);
  });
});

describe('the limit', () => {
  it('shows at most 3, dropping the oldest and its timer', () => {
    const { clock } = setup();
    info();
    info();
    info();
    info();
    expect(messages()).toEqual(['Saved 2', 'Saved 3', 'Saved 4']);
    expect(clock.live()).toHaveLength(3);
  });
});

describe('unmounting', () => {
  it('cancels every pending timer', () => {
    const { clock, unmount } = setup();
    info();
    info();
    expect(clock.live()).toHaveLength(2);
    unmount();
    expect(clock.live()).toHaveLength(0);
  });
});
