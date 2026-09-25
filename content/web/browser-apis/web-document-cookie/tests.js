const { parseCookies, serializeCookie, deleteCookie } = solution;

/** Splits a serialized cookie into its first pair and a sorted list of attributes. */
const shape = (cookie) => {
  const [pair, ...attrs] = cookie.split('; ');
  return { pair, attrs: attrs.sort() };
};

describe('parseCookies', () => {
  it('parses pairs, trimming whitespace', () => {
    expect(parseCookies('theme=dark; lang=en-GB;  cart = 3 ')).toEqual({ theme: 'dark', lang: 'en-GB', cart: '3' });
    expect(parseCookies('a=1;b=2')).toEqual({ a: '1', b: '2' });
  });

  it('splits at the first "=" only', () => {
    expect(parseCookies('token=eyJhbGciOi==; q=a=b=c')).toEqual({ token: 'eyJhbGciOi==', q: 'a=b=c' });
  });

  it('decodes values, and survives values that are not valid escapes', () => {
    expect(parseCookies('name=Zo%C3%AB%20B; bad=100%; worse=%E0%A4%A'))
      .toEqual({ name: 'Zoë B', bad: '100%', worse: '%E0%A4%A' });
  });

  it('removes surrounding double quotes', () => {
    expect(parseCookies('q="a b"; v="%C3%A9"; lone="')).toEqual({ q: 'a b', v: 'é', lone: '"' });
  });

  it('skips pairs without "=", keeps empty values, and keeps the first duplicate', () => {
    expect(parseCookies('flag; empty=; id=1; id=2')).toEqual({ empty: '', id: '1' });
    expect(parseCookies('')).toEqual({});
  });
});

describe('serializeCookie', () => {
  it('encodes the value', () => {
    expect(serializeCookie('q', 'a b;c=d,é')).toBe('q=a%20b%3Bc%3Dd%2C%C3%A9');
    expect(serializeCookie('n', 42)).toBe('n=42');
    expect(parseCookies(serializeCookie('rt', 'x; y=1%'))).toEqual({ rt: 'x; y=1%' });
  });

  it('writes every attribute', () => {
    const expires = new Date(Date.UTC(2030, 0, 2, 3, 4, 5));
    expect(shape(serializeCookie('sid', 'abc', {
      maxAge: 3600, expires, domain: 'shop.com', path: '/account', secure: true, httpOnly: true, sameSite: 'none', partitioned: true,
    }))).toEqual({
      pair: 'sid=abc',
      attrs: ['Domain=shop.com', 'Expires=Wed, 02 Jan 2030 03:04:05 GMT', 'HttpOnly', 'Max-Age=3600', 'Partitioned', 'Path=/account', 'SameSite=None', 'Secure'],
    });
  });

  it('omits false and undefined options, but keeps Max-Age=0', () => {
    expect(serializeCookie('a', '1', { secure: false, httpOnly: false, partitioned: false, path: undefined })).toBe('a=1');
    expect(shape(serializeCookie('a', '1', { maxAge: 0 })).attrs).toEqual(['Max-Age=0']);
  });

  it('normalises SameSite', () => {
    expect(shape(serializeCookie('a', '1', { sameSite: 'LAX' })).attrs).toEqual(['SameSite=Lax']);
    expect(shape(serializeCookie('a', '1', { sameSite: 'strict' })).attrs).toEqual(['SameSite=Strict']);
  });

  it('rejects bad names and bad options', () => {
    for (const name of ['', 'my cookie', 'a;b', 'a=b', 'é', 'a,b']) {
      expect(() => serializeCookie(name, '1')).toThrow(TypeError);
    }
    expect(() => serializeCookie('a', '1', { maxAge: 1.5 })).toThrow(TypeError);
    expect(() => serializeCookie('a', '1', { maxAge: '60' })).toThrow(TypeError);
    expect(() => serializeCookie('a', '1', { expires: new Date('nope') })).toThrow(TypeError);
    expect(() => serializeCookie('a', '1', { expires: '2030-01-01' })).toThrow(TypeError);
    expect(() => serializeCookie('a', '1', { sameSite: 'relaxed' })).toThrow(TypeError);
    expect(serializeCookie("a!#$%&'*+-.^_`|~9", '1')).toBe("a!#$%&'*+-.^_`|~9=1");
  });

  it('refuses the combinations browsers silently drop', () => {
    expect(() => serializeCookie('a', '1', { sameSite: 'None' })).toThrow(TypeError);
    expect(() => serializeCookie('a', '1', { partitioned: true })).toThrow(TypeError);
    expect(() => serializeCookie('__Secure-id', '1')).toThrow(TypeError);
    expect(() => serializeCookie('__Host-id', '1', { path: '/' })).toThrow(TypeError);
    expect(() => serializeCookie('__Host-id', '1', { secure: true })).toThrow(TypeError);
    expect(() => serializeCookie('__Host-id', '1', { secure: true, path: '/app' })).toThrow(TypeError);
    expect(() => serializeCookie('__Host-id', '1', { secure: true, path: '/', domain: 'shop.com' })).toThrow(TypeError);
    expect(shape(serializeCookie('__Host-id', '1', { secure: true, path: '/' })).attrs).toEqual(['Path=/', 'Secure']);
    expect(shape(serializeCookie('__Secure-id', '1', { secure: true, sameSite: 'none' })).attrs).toEqual(['SameSite=None', 'Secure']);
  });
});

describe('deleteCookie', () => {
  it('expires the cookie with the same path and domain', () => {
    expect(shape(deleteCookie('sid', { path: '/account', domain: 'shop.com' })))
      .toEqual({ pair: 'sid=', attrs: ['Domain=shop.com', 'Max-Age=0', 'Path=/account'] });
    expect(shape(deleteCookie('theme'))).toEqual({ pair: 'theme=', attrs: ['Max-Age=0'] });
  });

  it('adds Secure for prefixed names', () => {
    expect(shape(deleteCookie('__Host-sid', { path: '/' }))).toEqual({ pair: '__Host-sid=', attrs: ['Max-Age=0', 'Path=/', 'Secure'] });
    expect(shape(deleteCookie('__Secure-sid')).attrs).toEqual(['Max-Age=0', 'Secure']);
  });
});
