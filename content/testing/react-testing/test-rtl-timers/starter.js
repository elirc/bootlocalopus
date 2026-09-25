/** A scheduler that records timers instead of running them. */
function fakeScheduler() {
  const timers = [];
  const schedule = (fn, ms) => {
    const timer = { fn, ms, cancelled: false, fired: false };
    timers.push(timer);
    return () => { timer.cancelled = true; };
  };
  /** Timers that have neither fired nor been cancelled. */
  const live = () => timers.filter((t) => !t.cancelled && !t.fired);
  /** Fires every live timer, inside act. */
  const fireAll = () => act(() => {
    for (const t of live()) { t.fired = true; t.fn(); }
  });
  return { schedule, timers, live, fireAll };
}

/** Buttons that call notify, so tests can raise toasts like the app does. */
function Triggers() {
  const notify = solution.useToast();
  return (
    <div>
      <button onClick={() => notify('Saved')}>info</button>
      <button onClick={() => notify('Payment failed', { kind: 'error' })}>error</button>
    </div>
  );
}

function setup() {
  const clock = fakeScheduler();
  const utils = render(<solution.ToastProvider schedule={clock.schedule}><Triggers /></solution.ToastProvider>);
  return { clock, ...utils };
}

describe('toasts', () => {
  it('shows an info toast', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'info' }));
    expect(screen.getByRole('status').textContent).toContain('Saved');
  });

  // TODO: the delay and firing, errors staying, Dismiss (and its timer), hover and leave,
  // the limit of 3, and unmounting.
});
