const { AnnouncerProvider, useAnnounce, AddToCart } = solution;

const politeRegion = () => document.querySelector('[aria-live="polite"]');
const assertiveRegion = () => document.querySelector('[aria-live="assertive"]');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// A test component that exposes announce() to the test.
function Harness({ onReady, children }) {
  const announce = useAnnounce();
  onReady(announce);
  return children ?? null;
}

function setup() {
  let announce;
  const utils = render(
    <AnnouncerProvider>
      <Harness onReady={(a) => { announce = a; }} />
    </AnnouncerProvider>,
  );
  return { ...utils, announce: (...args) => act(() => announce(...args)), get raw() { return announce; } };
}

describe('AnnouncerProvider', () => {
  it('renders two empty, atomic live regions from the first render', () => {
    setup();
    expect(politeRegion()).toBeTruthy();
    expect(assertiveRegion()).toBeTruthy();
    expect(politeRegion().textContent).toBe('');
    expect(assertiveRegion().textContent).toBe('');
    expect(politeRegion().getAttribute('aria-atomic')).toBe('true');
    expect(assertiveRegion().getAttribute('aria-atomic')).toBe('true');
  });

  it('renders its children', () => {
    render(<AnnouncerProvider><p>Page content</p></AnnouncerProvider>);
    expect(screen.getByText('Page content')).toBeTruthy();
  });

  it('announces politely by default, and assertively on request', () => {
    const h = setup();
    h.announce('Saved');
    expect(politeRegion().textContent).toBe('Saved');
    expect(assertiveRegion().textContent).toBe('');
    h.announce('Connection lost', 'assertive');
    expect(assertiveRegion().textContent).toBe('Connection lost');
    expect(politeRegion().textContent).toBe('Saved');
  });

  it('replaces the previous message instead of piling them up', () => {
    const h = setup();
    h.announce('3 results');
    h.announce('12 results');
    expect(politeRegion().textContent).toBe('12 results');
  });

  it('renders a repeated message as a new element, so it is read again', () => {
    const h = setup();
    h.announce('Added to cart');
    const first = politeRegion().firstElementChild;
    expect(first).toBeTruthy();
    h.announce('Added to cart');
    const second = politeRegion().firstElementChild;
    expect(second.textContent).toBe('Added to cart');
    expect(second).not.toBe(first);
    expect(first.isConnected).toBe(false);
  });

  it('keeps announce stable across re-renders', () => {
    const seen = [];
    function App({ n }) {
      return (
        <AnnouncerProvider>
          <Harness onReady={(a) => seen.push(a)}><p>{n}</p></Harness>
        </AnnouncerProvider>
      );
    }
    const { rerender } = render(<App n={1} />);
    rerender(<App n={2} />);
    act(() => seen[1]('hello'));
    rerender(<App n={3} />);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(seen).size).toBe(1);
  });

  it('throws a clear error outside a provider', () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Harness onReady={() => {}} />)).toThrow('useAnnounce must be used inside <AnnouncerProvider>');
    } finally {
      console.error = original;
    }
  });
});

describe('AddToCart', () => {
  function renderCart(onAdd) {
    render(
      <AnnouncerProvider>
        <AddToCart name="Tea" onAdd={onAdd} />
      </AnnouncerProvider>,
    );
    return screen.getByRole('button', { name: 'Add Tea to cart' });
  }

  it('announces success politely', async () => {
    const d = deferred();
    const button = renderCart(() => d.promise);
    fireEvent.click(button);
    expect(politeRegion().textContent).toBe('');
    await act(async () => { d.resolve(); });
    expect(politeRegion().textContent).toBe('Added Tea to cart');
  });

  it('is disabled while pending and ignores a second click', async () => {
    const d = deferred();
    let calls = 0;
    const button = renderCart(() => { calls++; return d.promise; });
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(calls).toBe(1);
    await act(async () => { d.resolve(); });
    expect(button.disabled).toBe(false);
  });

  it('announces the same success again for a second add', async () => {
    const button = renderCart(() => Promise.resolve());
    await act(async () => { fireEvent.click(button); });
    const first = politeRegion().firstElementChild;
    await act(async () => { fireEvent.click(button); });
    expect(politeRegion().textContent).toBe('Added Tea to cart');
    expect(politeRegion().firstElementChild).not.toBe(first);
  });

  it('announces a failure assertively and re-enables the button', async () => {
    const d = deferred();
    const button = renderCart(() => d.promise);
    fireEvent.click(button);
    await act(async () => { d.reject(new Error('503')); });
    expect(assertiveRegion().textContent).toBe('Could not add Tea to cart');
    expect(politeRegion().textContent).toBe('');
    expect(button.disabled).toBe(false);
    // An unhandled rejection from the click handler would fail this test.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  });
});
