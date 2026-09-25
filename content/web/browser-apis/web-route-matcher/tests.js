const { createRouter } = solution;

const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'product', path: '/products/:id' },
  { name: 'newProduct', path: '/products/new' },
  { name: 'review', path: '/products/:id/reviews/:reviewId' },
  { name: 'feed', path: '/files.json' },
  { name: 'docsAny', path: '/docs/*' },
  { name: 'docsPage', path: '/docs/:page' },
  { name: 'docsSection', path: '/docs/:page/*' },
  { name: 'notFound', path: '/*' },
];
const router = () => createRouter(ROUTES);

describe('match', () => {
  it('matches static and param routes, with query and hash', () => {
    const r = router();
    expect(r.match('/')).toEqual({ name: 'home', params: {}, query: {} });
    expect(r.match('/products/42?tab=reviews&tab=qa&sort=new#top'))
      .toEqual({ name: 'product', params: { id: '42' }, query: { tab: 'qa', sort: 'new' } });
    expect(r.match('/products/42/reviews/7')).toEqual({ name: 'review', params: { id: '42', reviewId: '7' }, query: {} });
  });

  it('ignores a trailing slash', () => {
    expect(router().match('/products/42/')).toEqual({ name: 'product', params: { id: '42' }, query: {} });
    expect(router().match('/products/42/?a=1').query).toEqual({ a: '1' });
  });

  it('decodes params', () => {
    expect(router().match('/products/caf%C3%A9%20cr%C3%A8me').params).toEqual({ id: 'café crème' });
    expect(router().match('/products/a%2Fb').params).toEqual({ id: 'a/b' });
  });

  it('treats static characters literally', () => {
    expect(router().match('/files.json').name).toBe('feed');
    expect(router().match('/filesXjson').name).toBe('notFound');
  });

  it('never throws on a malformed escape; that route just does not match', () => {
    // Even the catch-all cannot decode its splat, so nothing matches.
    expect(router().match('/products/%E0%A4%A')).toBe(null);
    const fallback = createRouter([{ name: 'product', path: '/products/:id' }, { name: 'raw', path: '/products/:id/raw' }]);
    expect(fallback.match('/products/%ZZ/raw')).toBe(null);
    const strict = createRouter([{ name: 'product', path: '/products/:id' }]);
    expect(strict.match('/products/%E0%A4%A')).toBe(null);
    expect(strict.match('/products/100%')).toBe(null);
  });

  it('returns null when nothing matches, and an empty segment matches nothing', () => {
    const r = createRouter([{ name: 'product', path: '/products/:id' }, { name: 'list', path: '/products' }]);
    expect(r.match('/orders/1')).toBe(null);
    expect(r.match('/products/1/extra')).toBe(null);
    expect(r.match('/products//')).toEqual({ name: 'list', params: {}, query: {} });
    expect(r.match('/products//1')).toBe(null);
  });

  it('is case-sensitive for static segments', () => {
    const r = createRouter([{ name: 'about', path: '/about' }]);
    expect(r.match('/About')).toBe(null);
  });
});

describe('specificity', () => {
  it('prefers a static segment over a param, whatever the order', () => {
    expect(router().match('/products/new').name).toBe('newProduct');
    const reversed = createRouter([...ROUTES].reverse());
    expect(reversed.match('/products/new').name).toBe('newProduct');
    expect(reversed.match('/products/9').name).toBe('product');
  });

  it('prefers a param over a splat, and an ended pattern over an empty splat', () => {
    for (const r of [router(), createRouter([...ROUTES].reverse())]) {
      expect(r.match('/docs/intro')).toEqual({ name: 'docsPage', params: { page: 'intro' }, query: {} });
      expect(r.match('/docs/intro/setup/linux')).toEqual({ name: 'docsSection', params: { page: 'intro', '*': 'setup/linux' }, query: {} });
      expect(r.match('/docs')).toEqual({ name: 'docsAny', params: { '*': '' }, query: {} });
      expect(r.match('/nope/at/all')).toEqual({ name: 'notFound', params: { '*': 'nope/at/all' }, query: {} });
    }
  });

  it('decides at the first differing segment', () => {
    const r = createRouter([
      { name: 'paramFirst', path: '/a/:x/c' },
      { name: 'staticFirst', path: '/a/b/:y' },
    ]);
    expect(r.match('/a/b/c').name).toBe('staticFirst');
    expect(r.match('/a/z/c').name).toBe('paramFirst');
  });

  it('keeps declaration order between routes of the same shape', () => {
    const r = createRouter([
      { name: 'first', path: '/u/:id' },
      { name: 'second', path: '/u/:slug' },
    ]);
    expect(r.match('/u/1').name).toBe('first');
    expect(r.match('/u/1').params).toEqual({ id: '1' });
  });

  it('decodes each splat segment', () => {
    expect(router().match('/docs/intro/caf%C3%A9/a%20b').params).toEqual({ page: 'intro', '*': 'café/a b' });
  });
});

describe('href', () => {
  it('builds paths', () => {
    const r = router();
    expect(r.href('home')).toBe('/');
    expect(r.href('product', { id: 42 })).toBe('/products/42');
    expect(r.href('review', { id: 'mug', reviewId: 3 })).toBe('/products/mug/reviews/3');
    expect(r.href('docsSection', { page: 'intro', '*': 'setup/linux' })).toBe('/docs/intro/setup/linux');
  });

  it('encodes params so they stay one segment', () => {
    expect(router().href('product', { id: 'a/b?c#d' })).toBe('/products/a%2Fb%3Fc%23d');
  });

  it('round-trips awkward params through match', () => {
    const r = router();
    for (const id of ['a/b', 'what?#', '100%', 'café crème', 'new-ish', '-1']) {
      expect(r.match(r.href('product', { id }))).toEqual({ name: 'product', params: { id }, query: {} });
    }
    const docs = r.match(r.href('docsSection', { page: 'a b', '*': 'x y/é/%' }));
    expect(docs.params).toEqual({ page: 'a b', '*': 'x y/é/%' });
  });

  it('throws for an unknown route or a missing param', () => {
    const r = router();
    expect(() => r.href('nope')).toThrow(Error);
    expect(() => r.href('product')).toThrow(Error);
    expect(() => r.href('product', { id: null })).toThrow(Error);
    expect(() => r.href('product', { id: '' })).toThrow(Error);
    expect(() => r.href('review', { id: 1 })).toThrow(Error);
  });
});
