const { startNavigation } = solution;

let cleanups = [];
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

/**
 * Renders `html`, starts navigation on `rootSelector` (or document) and
 * records every onNavigate call. A window-level listener, registered last,
 * records whether the click was prevented and then stops jsdom from trying to
 * navigate for real.
 */
function setup(html, rootSelector) {
  document.body.innerHTML = html;
  const calls = [];
  const root = rootSelector ? document.querySelector(rootSelector) : undefined;
  const nav = startNavigation({ ...(root ? { root } : {}), onNavigate: (loc) => calls.push(loc) });
  const clicks = [];
  const record = (event) => { clicks.push(event.defaultPrevented); event.preventDefault(); };
  window.addEventListener('click', record);
  cleanups.push(() => nav.stop(), () => window.removeEventListener('click', record));
  const click = (selector, init) => {
    fireEvent.click(document.querySelector(selector), init);
    return clicks[clicks.length - 1];
  };
  return { nav, calls, click };
}

const here = () => location.pathname + location.search + location.hash;

describe('intercepting links', () => {
  it('takes over a plain same-origin click', () => {
    const { calls, click } = setup('<nav><a id="p" href="/products/42?tab=qa#top">Mug</a></nav>');
    const before = history.length;
    expect(click('#p')).toBe(true);
    expect(calls).toEqual(['/products/42?tab=qa#top']);
    expect(here()).toBe('/products/42?tab=qa#top');
    expect(history.length).toBe(before + 1);
  });

  it('finds the link from an element inside it, and handles relative hrefs', () => {
    history.replaceState(null, '', '/shop/cart');
    const { calls, click } = setup('<a href="checkout"><svg><path id="icon"></path></svg><span id="label">Pay</span></a>');
    expect(click('#label')).toBe(true);
    expect(calls).toEqual(['/shop/checkout']);
    history.replaceState(null, '', '/shop/cart');
    expect(click('#icon')).toBe(true);
    expect(calls).toEqual(['/shop/checkout', '/shop/checkout']);
  });

  it('handles links added after it started', () => {
    const { calls, click } = setup('<ul id="list"></ul>');
    document.querySelector('#list').innerHTML = '<li><a id="late" href="/late">Late</a></li>';
    expect(click('#late')).toBe(true);
    expect(calls).toEqual(['/late']);
  });

  it('replaces instead of pushing when the link points at the current page', () => {
    history.replaceState(null, '', '/orders?page=2');
    const { calls, click } = setup('<a id="same" href="/orders?page=2">Orders</a>');
    const before = history.length;
    expect(click('#same')).toBe(true);
    expect(history.length).toBe(before);
    expect(calls).toEqual(['/orders?page=2']);
  });

  it('accepts target="_self"', () => {
    const { calls, click } = setup('<a id="s" href="/self" target="_SELF">x</a>');
    expect(click('#s')).toBe(true);
    expect(calls).toEqual(['/self']);
  });
});

describe('leaving the browser in charge', () => {
  it('ignores modified clicks and non-primary buttons', () => {
    const { calls, click } = setup('<a id="p" href="/products/1">Mug</a>');
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(click('#p', init)).toBe(false);
    }
    expect(calls).toEqual([]);
    expect(here()).toBe('/');
  });

  it('ignores new-tab targets and downloads', () => {
    const { calls, click } = setup(`
      <a id="blank" href="/a" target="_blank">a</a>
      <a id="named" href="/b" target="preview">b</a>
      <a id="dl" href="/report.csv" download>c</a>`);
    expect(click('#blank')).toBe(false);
    expect(click('#named')).toBe(false);
    expect(click('#dl')).toBe(false);
    expect(calls).toEqual([]);
  });

  it('ignores other origins and schemes', () => {
    const { calls, click } = setup(`
      <a id="ext" href="https://example.com/x">x</a>
      <a id="port" href="http://localhost:8080/x">x</a>
      <a id="mail" href="mailto:help@shop.com">x</a>
      <a id="tel" href="tel:+441234">x</a>`);
    for (const id of ['#ext', '#port', '#mail', '#tel']) expect(click(id)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('lets in-page anchors scroll, but takes over a hash on another page', () => {
    history.replaceState(null, '', '/docs?v=2');
    const { calls, click } = setup(`
      <a id="anchor" href="#install">Install</a>
      <a id="full" href="/docs?v=2#install">Install</a>
      <a id="other" href="/docs?v=3#install">v3</a>`);
    expect(click('#anchor')).toBe(false);
    expect(click('#full')).toBe(false);
    expect(click('#other')).toBe(true);
    expect(calls).toEqual(['/docs?v=3#install']);
  });

  it('ignores a click someone already handled', () => {
    const { calls, click } = setup('<a id="p" href="/products/1"><button id="fav">★</button></a>');
    document.querySelector('#fav').addEventListener('click', (e) => e.preventDefault());
    click('#fav');
    expect(calls).toEqual([]);
    expect(here()).toBe('/');
  });

  it('ignores links outside its root, and anchors without href', () => {
    const { calls, click } = setup(`
      <nav><a id="outside" href="/outside">out</a></nav>
      <main><a id="inside" href="/inside">in</a><a id="nohref">no</a></main>`, 'main');
    expect(click('#outside')).toBe(false);
    expect(click('#nohref')).toBe(false);
    expect(click('#inside')).toBe(true);
    expect(calls).toEqual(['/inside']);
  });
});

describe('navigate and history', () => {
  it('pushes by default and replaces on request', () => {
    const { nav, calls } = setup('');
    const before = history.length;
    nav.navigate('/a?x=1');
    expect(history.length).toBe(before + 1);
    nav.navigate('/b', { replace: true });
    expect(history.length).toBe(before + 1);
    expect(here()).toBe('/b');
    expect(calls).toEqual(['/a?x=1', '/b']);
  });

  it('refuses another origin', () => {
    const { nav, calls } = setup('');
    expect(() => nav.navigate('https://evil.io/steal')).toThrow(TypeError);
    expect(calls).toEqual([]);
  });

  it('reports back and forward through popstate', async () => {
    const { nav, calls } = setup('');
    nav.navigate('/one');
    nav.navigate('/two?x=1');
    history.back();
    await waitFor(() => expect(calls).toEqual(['/one', '/two?x=1', '/one']));
  });

  it('stop() removes both listeners', async () => {
    const { nav, calls, click } = setup('<a id="p" href="/products/1">Mug</a>');
    nav.navigate('/one');
    nav.navigate('/two');
    nav.stop();
    expect(click('#p')).toBe(false);
    let popped = false;
    const spy = () => { popped = true; };
    window.addEventListener('popstate', spy);
    cleanups.push(() => window.removeEventListener('popstate', spy));
    history.back();
    await waitFor(() => expect(popped).toBe(true));
    expect(calls).toEqual(['/one', '/two']);
  });
});
