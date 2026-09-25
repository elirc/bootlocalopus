/**
 * jsdom + React DOM + Testing Library as globals, for `react` lessons (and
 * `mutation` lessons whose subject is a component).
 */
export async function setupDom() {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const win = dom.window;

  // Several of these exist on modern Node's globalThis as getter-only
  // properties, so a plain assignment throws. Always go through defineProperty.
  const def = (key, value) => {
    try {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    } catch { /* non-configurable host global; jsdom's own copy will be used */ }
  };

  def('window', win);
  def('document', win.document);
  def('self', win);
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key in globalThis || key.startsWith('_')) continue;
    try {
      Object.defineProperty(globalThis, key, { get: () => win[key], configurable: true });
    } catch { /* ignore */ }
  }
  for (const key of ['navigator', 'location', 'history', 'requestAnimationFrame', 'cancelAnimationFrame',
                     'getComputedStyle', 'matchMedia', 'localStorage', 'sessionStorage', 'scrollTo']) {
    if (win[key] === undefined) continue;
    def(key, typeof win[key] === 'function' ? win[key].bind(win) : win[key]);
  }
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    def('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 16));
    def('cancelAnimationFrame', clearTimeout);
  }

  // Node has its own Event family, and jsdom rejects Node-realm events in
  // dispatchEvent(). Tests that build an event must get jsdom's.
  //
  // AbortController/AbortSignal deliberately stay Node's: Node's fetch()
  // rejects a jsdom AbortSignal ("Expected signal to be an instance of
  // AbortSignal"), and fetch-with-a-signal is far more common in these
  // lessons than addEventListener(..., { signal }) on a DOM node.
  // FormData too: Node's cannot read a jsdom <form> (`new FormData(form)` throws).
  for (const key of ['Event', 'CustomEvent', 'EventTarget', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'InputEvent', 'FormData']) {
    if (win[key]) def(key, win[key]);
  }

  const rtl = await import('@testing-library/react');
  const React = await import('react');

  // IS_REACT_ACT_ENVIRONMENT is toggled by Testing Library's waitFor, so it
  // cannot be a read-only value; a locked accessor keeps it un-redefinable
  // while letting the assignments through.
  let actEnvironment = true;
  const actAccessor = {
    get: () => actEnvironment,
    set: (v) => { actEnvironment = v; },
  };

  const globals = {
    React: React.default || React,
    render: rtl.render,
    screen: rtl.screen,
    fireEvent: rtl.fireEvent,
    waitFor: rtl.waitFor,
    act: rtl.act,
    within: rtl.within,
    renderHook: rtl.renderHook,
    cleanup: rtl.cleanup,
  };

  /** Per-test reset: unmount, then clear what jsdom would otherwise carry into the next test. */
  const reset = () => {
    rtl.cleanup();
    try { win.localStorage.clear(); } catch { /* ignore */ }
    try { win.sessionStorage.clear(); } catch { /* ignore */ }
    try { win.document.title = ''; } catch { /* ignore */ }
    try { win.document.head.innerHTML = ''; } catch { /* ignore */ }
    try { win.document.body.innerHTML = ''; } catch { /* ignore */ }
    try { win.history.replaceState(null, '', '/'); } catch { /* ignore */ }
  };

  return {
    globals,
    accessors: { IS_REACT_ACT_ENVIRONMENT: actAccessor },
    attach(harness) {
      harness.addRootHook('afterEach', () => { reset(); });
    },
  };
}
