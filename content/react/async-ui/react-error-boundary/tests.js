// React logs every caught render error (and jsdom logs the dev-mode rethrow).
// That is noise here, so console.error is silenced for every test.
let quiet;
beforeEach(() => {
  quiet = console.error;
  console.error = () => {};
});
afterEach(() => {
  console.error = quiet;
});

// A child whose health is controlled from outside the tree.
const health = { broken: false, message: 'widget exploded' };
function Flaky() {
  const [clicks, setClicks] = React.useState(0);
  if (health.broken) throw new Error(health.message);
  return <button onClick={() => setClicks((n) => n + 1)}>widget {clicks}</button>;
}

const fallback = ({ error, reset }) => (
  <div role="alert">
    <p>Failed: {error.message}</p>
    <button onClick={reset}>Try again</button>
  </div>
);

const widget = () => screen.queryByRole('button', { name: /^widget/ });

describe('catching render errors', () => {
  beforeEach(() => { health.broken = false; health.message = 'widget exploded'; });

  it('renders the children untouched while healthy', () => {
    render(<solution.ErrorBoundary fallbackRender={fallback}><Flaky /></solution.ErrorBoundary>);
    expect(widget().textContent).toBe('widget 0');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the fallback with the thrown error', () => {
    health.broken = true;
    render(<solution.ErrorBoundary fallbackRender={fallback}><Flaky /></solution.ErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toContain('Failed: widget exploded');
    expect(widget()).toBeNull();
  });

  it('catches a child that starts throwing on a later render', () => {
    const { rerender } = render(<solution.ErrorBoundary fallbackRender={fallback}><Flaky /></solution.ErrorBoundary>);
    health.broken = true;
    rerender(<solution.ErrorBoundary fallbackRender={fallback}><Flaky /></solution.ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('calls onError once per caught error, with the error and a component stack', () => {
    const calls = [];
    health.broken = true;
    render(
      <solution.ErrorBoundary fallbackRender={fallback} onError={(error, info) => calls.push([error, info])}>
        <Flaky />
      </solution.ErrorBoundary>,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBeInstanceOf(Error);
    expect(calls[0][0].message).toBe('widget exploded');
    expect(typeof calls[0][1].componentStack).toBe('string');
    expect(calls[0][1].componentStack).toContain('Flaky');
  });

  it('shows the fallback even when the thrown value is not an Error', () => {
    function ThrowsNull() { throw null; }
    // An uncaught `null` escapes render() as `null`; turn that into a real failure.
    let escaped = false;
    try {
      render(
        <solution.ErrorBoundary fallbackRender={({ error }) => <p role="alert">caught {String(error)}</p>}>
          <ThrowsNull />
        </solution.ErrorBoundary>,
      );
    } catch (e) {
      escaped = true;
    }
    assert(!escaped, 'the thrown null escaped the boundary and unmounted the tree');
    expect(screen.getByRole('alert').textContent).toBe('caught null');
  });

  it('keeps a sibling outside the boundary mounted, with its state', () => {
    function Sibling() {
      const [n, setN] = React.useState(0);
      return <button onClick={() => setN(n + 1)}>sibling {n}</button>;
    }
    function Page({ broken }) {
      health.broken = broken;
      return (
        <main>
          <Sibling />
          <solution.ErrorBoundary fallbackRender={fallback}><Flaky /></solution.ErrorBoundary>
        </main>
      );
    }
    const { rerender } = render(<Page broken={false} />);
    const sibling = screen.getByRole('button', { name: /^sibling/ });
    fireEvent.click(sibling);
    fireEvent.click(sibling);
    rerender(<Page broken />);
    expect(screen.getByRole('alert')).toBeTruthy();
    // Same DOM node, same state: the sibling was never unmounted.
    expect(screen.getByRole('button', { name: /^sibling/ })).toBe(sibling);
    expect(sibling.textContent).toBe('sibling 2');
  });
});

describe('reset', () => {
  beforeEach(() => { health.broken = false; health.message = 'widget exploded'; });

  it('reset() renders the children again, freshly mounted', () => {
    render(<solution.ErrorBoundary fallbackRender={fallback}><Flaky /></solution.ErrorBoundary>);
    fireEvent.click(widget());
    fireEvent.click(widget());
    expect(widget().textContent).toBe('widget 2');

    health.broken = true;
    fireEvent.click(widget()); // re-renders Flaky, which now throws
    expect(screen.getByRole('alert')).toBeTruthy();

    health.broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(widget().textContent).toBe('widget 0');
  });

  it('shows the fallback again if the children still throw after reset()', () => {
    const errors = [];
    health.broken = true;
    render(
      <solution.ErrorBoundary fallbackRender={fallback} onError={(e) => errors.push(e.message)}>
        <Flaky />
      </solution.ErrorBoundary>,
    );
    health.message = 'still broken';
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('alert').textContent).toContain('Failed: still broken');
    expect(errors).toEqual(['widget exploded', 'still broken']);
  });

  it('resets when a resetKeys element changes while the fallback is showing', () => {
    health.broken = true;
    const { rerender } = render(
      <solution.ErrorBoundary fallbackRender={fallback} resetKeys={['user-1', 3]}><Flaky /></solution.ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    // Same values in a new array: not a change.
    rerender(<solution.ErrorBoundary fallbackRender={fallback} resetKeys={['user-1', 3]}><Flaky /></solution.ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();

    health.broken = false;
    rerender(<solution.ErrorBoundary fallbackRender={fallback} resetKeys={['user-1', 3]}><Flaky /></solution.ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy(); // healthy now, but nothing asked for a reset

    rerender(<solution.ErrorBoundary fallbackRender={fallback} resetKeys={['user-2', 3]}><Flaky /></solution.ErrorBoundary>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(widget().textContent).toBe('widget 0');
  });

  it('treats a resetKeys length change as a change', () => {
    health.broken = true;
    const { rerender } = render(
      <solution.ErrorBoundary fallbackRender={fallback} resetKeys={['a']}><Flaky /></solution.ErrorBoundary>,
    );
    health.broken = false;
    rerender(<solution.ErrorBoundary fallbackRender={fallback} resetKeys={['a', 'b']}><Flaky /></solution.ErrorBoundary>);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not remount healthy children when resetKeys change', () => {
    const { rerender } = render(
      <solution.ErrorBoundary fallbackRender={fallback} resetKeys={[1]}><Flaky /></solution.ErrorBoundary>,
    );
    fireEvent.click(widget());
    const node = widget();
    rerender(<solution.ErrorBoundary fallbackRender={fallback} resetKeys={[2]}><Flaky /></solution.ErrorBoundary>);
    expect(widget()).toBe(node);
    expect(widget().textContent).toBe('widget 1');
  });

  it('does not reset in the same update that threw', () => {
    // The keys change AND the child starts throwing in one render. Resetting
    // immediately would re-render the still-broken child and loop.
    const errors = [];
    const { rerender } = render(
      <solution.ErrorBoundary fallbackRender={fallback} resetKeys={[1]} onError={(e) => errors.push(e)}>
        <Flaky />
      </solution.ErrorBoundary>,
    );
    health.broken = true;
    rerender(
      <solution.ErrorBoundary fallbackRender={fallback} resetKeys={[2]} onError={(e) => errors.push(e)}>
        <Flaky />
      </solution.ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(errors).toHaveLength(1);
  });
});

describe('what a boundary does not catch', () => {
  it('lets an event-handler error through: the children stay on screen', () => {
    function Clumsy() {
      return <button onClick={() => { throw new Error('handler boom'); }}>Save</button>;
    }
    const reported = [];
    const onWindowError = (event) => {
      reported.push(event.error && event.error.message);
      event.preventDefault();
    };
    window.addEventListener('error', onWindowError);
    let caught = 0;
    try {
      render(
        <solution.ErrorBoundary fallbackRender={fallback} onError={() => caught++}>
          <Clumsy />
        </solution.ErrorBoundary>,
      );
      try { fireEvent.click(screen.getByRole('button', { name: 'Save' })); } catch { /* jsdom may rethrow */ }
    } finally {
      window.removeEventListener('error', onWindowError);
    }
    // The handler really did throw...
    expect(reported).toContain('handler boom');
    // ...and the boundary did not turn it into a fallback.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(caught).toBe(0);
  });
});
