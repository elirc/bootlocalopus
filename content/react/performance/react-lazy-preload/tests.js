// A fake dynamic import: `plan` says what each successive call does.
function chunk(name, plan = ['ok']) {
  const factory = () => {
    factory.calls++;
    const step = plan[Math.min(factory.calls - 1, plan.length - 1)];
    return step === 'ok'
      ? Promise.resolve({ default: function Page() { return <h1>{name} page</h1>; } })
      : Promise.reject(new Error('ChunkLoadError: ' + name));
  };
  factory.calls = 0;
  return factory;
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('lazyWithPreload', () => {
  it('does not load anything until asked', () => {
    const factory = chunk('Reports');
    solution.lazyWithPreload(factory);
    expect(factory.calls).toBe(0);
  });

  it('renders the module\'s default export inside Suspense', async () => {
    const Reports = solution.lazyWithPreload(chunk('Reports'));
    render(<React.Suspense fallback={<p>Loading…</p>}><Reports /></React.Suspense>);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect((await screen.findByRole('heading')).textContent).toBe('Reports page');
  });

  it('preload() starts the load once and returns the same promise every time', async () => {
    const factory = chunk('Reports');
    const Reports = solution.lazyWithPreload(factory);
    const first = Reports.preload();
    const second = Reports.preload();
    expect(first).toBe(second);
    expect(factory.calls).toBe(1);
    const mod = await first;
    expect(typeof mod.default).toBe('function');
  });

  it('does not load again when rendered after a preload, or rendered twice', async () => {
    const factory = chunk('Reports');
    const Reports = solution.lazyWithPreload(factory);
    await Reports.preload();
    render(
      <React.Suspense fallback={<p>Loading…</p>}>
        <Reports />
        <Reports />
      </React.Suspense>,
    );
    expect(await screen.findAllByRole('heading')).toHaveLength(2);
    expect(factory.calls).toBe(1);
  });

  it('does not load again when preloaded after it rendered', async () => {
    const factory = chunk('Reports');
    const Reports = solution.lazyWithPreload(factory);
    render(<React.Suspense fallback={<p>Loading…</p>}><Reports /></React.Suspense>);
    await screen.findByRole('heading');
    await Reports.preload();
    expect(factory.calls).toBe(1);
  });

  it('retries a failed load once by default', async () => {
    const factory = chunk('Reports', ['fail', 'ok']);
    const Reports = solution.lazyWithPreload(factory);
    render(<React.Suspense fallback={<p>Loading…</p>}><Reports /></React.Suspense>);
    expect((await screen.findByRole('heading')).textContent).toBe('Reports page');
    expect(factory.calls).toBe(2);
  });

  it('gives up after the retries, rejecting with the last error', async () => {
    const factory = chunk('Reports', ['fail']);
    const Reports = solution.lazyWithPreload(factory);
    await expect(Reports.preload()).rejects.toThrow('ChunkLoadError: Reports');
    expect(factory.calls).toBe(2);
  });

  it('honours a custom retry count, including 0', async () => {
    const flaky = chunk('A', ['fail', 'fail', 'fail', 'ok']);
    const A = solution.lazyWithPreload(flaky, { retries: 3 });
    await A.preload();
    expect(flaky.calls).toBe(4);

    const once = chunk('B', ['fail', 'ok']);
    const B = solution.lazyWithPreload(once, { retries: 0 });
    await expect(B.preload()).rejects.toThrow('ChunkLoadError: B');
    expect(once.calls).toBe(1);
  });
});

describe('PageSwitcher', () => {
  function setup(reportsPlan = ['ok']) {
    const homeFactory = chunk('Home');
    const reportsFactory = chunk('Reports', reportsPlan);
    const pages = [
      { name: 'Home', Component: solution.lazyWithPreload(homeFactory) },
      { name: 'Reports', Component: solution.lazyWithPreload(reportsFactory, { retries: 0 }) },
    ];
    render(<solution.PageSwitcher pages={pages} />);
    return { homeFactory, reportsFactory };
  }
  const navButton = (name) => within(screen.getByRole('navigation', { name: 'Pages' })).getByRole('button', { name });

  it('shows the first page and marks it current', async () => {
    setup();
    expect((await screen.findByRole('heading')).textContent).toBe('Home page');
    expect(navButton('Home').getAttribute('aria-current')).toBe('page');
    expect(navButton('Reports').getAttribute('aria-current')).toBeNull();
  });

  it('does not load the other pages up front', async () => {
    const { reportsFactory } = setup();
    await screen.findByRole('heading');
    expect(reportsFactory.calls).toBe(0);
  });

  it('starts loading a page when its link is hovered', async () => {
    const { reportsFactory } = setup();
    await screen.findByRole('heading');
    fireEvent.mouseEnter(navButton('Reports'));
    expect(reportsFactory.calls).toBe(1);
  });

  it('starts loading a page when its link gets keyboard focus', async () => {
    const { reportsFactory } = setup();
    await screen.findByRole('heading');
    fireEvent.focus(navButton('Reports'));
    expect(reportsFactory.calls).toBe(1);
  });

  it('opens a page on click, loading it once in total', async () => {
    const { reportsFactory } = setup();
    await screen.findByRole('heading');
    fireEvent.mouseEnter(navButton('Reports'));
    fireEvent.focus(navButton('Reports'));
    fireEvent.click(navButton('Reports'));
    expect((await screen.findByText('Reports page')).tagName).toBe('H1');
    expect(navButton('Reports').getAttribute('aria-current')).toBe('page');
    expect(reportsFactory.calls).toBe(1);
  });

  it('does not leave an unhandled rejection when a hovered page fails to load', async () => {
    setup(['fail']);
    await screen.findByRole('heading');
    fireEvent.mouseEnter(navButton('Reports'));
    // An uncaught rejection from the preload would fail this test here.
    await flush();
    expect(screen.getByText('Home page')).toBeTruthy();
  });

  it('shows an error for a page that cannot load, and recovers on another page', async () => {
    setup(['fail']);
    await screen.findByRole('heading');
    fireEvent.click(navButton('Reports'));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not load Reports');
    fireEvent.click(navButton('Home'));
    expect((await screen.findByRole('heading')).textContent).toBe('Home page');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
