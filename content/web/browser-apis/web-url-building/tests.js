const { apiUrl, withQuery } = solution;
const params = (href) => [...new URL(href).searchParams];

describe('apiUrl: paths', () => {
  it('appends segments after the base path, with or without a trailing slash', () => {
    expect(apiUrl('https://api.shop.com/v2', ['orders', 42])).toBe('https://api.shop.com/v2/orders/42');
    expect(apiUrl('https://api.shop.com/v2/', ['orders', 42])).toBe('https://api.shop.com/v2/orders/42');
    expect(apiUrl('https://api.shop.com', ['orders'])).toBe('https://api.shop.com/orders');
    expect(apiUrl('https://api.shop.com/', ['orders'])).toBe('https://api.shop.com/orders');
  });

  it('keeps a multi-level prefix', () => {
    expect(apiUrl('https://shop.com/api/v2', ['users', 'me'])).toBe('https://shop.com/api/v2/users/me');
  });

  it('encodes each segment as exactly one segment', () => {
    const href = apiUrl('https://api.shop.com/v2', ['users', 'a/b', 'café crème', 'what?#x']);
    expect(new URL(href).pathname).toBe('/v2/users/a%2Fb/caf%C3%A9%20cr%C3%A8me/what%3F%23x');
    expect(new URL(href).search).toBe('');
    expect(new URL(href).hash).toBe('');
  });

  it('refuses dot and empty segments', () => {
    for (const bad of ['..', '.', '']) {
      expect(() => apiUrl('https://api.shop.com/v2', ['users', bad, 'secrets'])).toThrow(TypeError);
    }
    // Only exact dot segments: these are ordinary names.
    expect(new URL(apiUrl('https://api.shop.com', ['..x', 'a.b'])).pathname).toBe('/..x/a.b');
  });
});

describe('apiUrl: query', () => {
  it('appends entries in order, repeating arrays and keeping falsy values', () => {
    const href = apiUrl('https://api.shop.com/v2', ['products'], {
      q: 'blue & white #1+1', tag: ['x', 'y'], page: 0, draft: false, empty: '', skip: undefined, none: null,
    });
    expect(new URL(href).pathname).toBe('/v2/products');
    expect(params(href)).toEqual([
      ['q', 'blue & white #1+1'], ['tag', 'x'], ['tag', 'y'], ['page', '0'], ['draft', 'false'], ['empty', ''],
    ]);
  });

  it('adds no "?" when there is nothing to add', () => {
    expect(apiUrl('https://api.shop.com/v2', ['a'])).toBe('https://api.shop.com/v2/a');
    expect(apiUrl('https://api.shop.com/v2', ['a'], {})).toBe('https://api.shop.com/v2/a');
    expect(apiUrl('https://api.shop.com/v2', ['a'], { x: undefined, y: null, z: [] })).toBe('https://api.shop.com/v2/a');
  });

  it('matches the example in the brief', () => {
    expect(apiUrl('https://api.shop.com/v2', ['users', 'a/b', 42], { tag: ['x', 'y'], page: 0 }))
      .toBe('https://api.shop.com/v2/users/a%2Fb/42?tag=x&tag=y&page=0');
  });
});

describe('withQuery', () => {
  const PAGE = 'https://shop.com/search?q=blue+mug&page=3&tag=a&tag=b#results';

  it('sets a value, leaving the rest, the path and the hash alone', () => {
    const href = withQuery(PAGE, { page: 1 });
    const url = new URL(href);
    expect(url.pathname).toBe('/search');
    expect(url.hash).toBe('#results');
    // Where the replaced key ends up is not graded; everything else keeps its order.
    expect(url.searchParams.getAll('page')).toEqual(['1']);
    expect(params(href).filter(([k]) => k !== 'page')).toEqual([['q', 'blue mug'], ['tag', 'a'], ['tag', 'b']]);
  });

  it('removes a key for undefined, null or an empty array', () => {
    expect(params(withQuery(PAGE, { page: undefined }))).toEqual([['q', 'blue mug'], ['tag', 'a'], ['tag', 'b']]);
    expect(params(withQuery(PAGE, { tag: null }))).toEqual([['q', 'blue mug'], ['page', '3']]);
    expect(params(withQuery(PAGE, { tag: [] }))).toEqual([['q', 'blue mug'], ['page', '3']]);
  });

  it('replaces every value of a key with an array', () => {
    const href = withQuery(PAGE, { tag: ['c', 'd', 'e'] });
    expect(new URL(href).searchParams.getAll('tag')).toEqual(['c', 'd', 'e']);
    expect(new URL(href).searchParams.get('q')).toBe('blue mug');
  });

  it('replaces a repeated key with a single value', () => {
    expect(new URL(withQuery(PAGE, { tag: 'z' })).searchParams.getAll('tag')).toEqual(['z']);
  });

  it('adds new keys at the end and keeps falsy values', () => {
    const href = withQuery('https://shop.com/list?sort=price', { page: 0, inStock: false, 'filter[brand]': 'Acme & Co' });
    expect(params(href)).toEqual([['sort', 'price'], ['page', '0'], ['inStock', 'false'], ['filter[brand]', 'Acme & Co']]);
  });

  it('works on a URL without a query or with nothing left', () => {
    expect(params(withQuery('https://shop.com/list#top', { q: 'a b' }))).toEqual([['q', 'a b']]);
    expect(new URL(withQuery('https://shop.com/list#top', { q: 'a b' })).hash).toBe('#top');
    const cleared = new URL(withQuery('https://shop.com/list?q=x#top', { q: null }));
    expect(cleared.search).toBe('');
    expect(cleared.pathname).toBe('/list');
    expect(cleared.hash).toBe('#top');
  });
});
