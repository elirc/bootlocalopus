const APP = 'https://app.example.com';
const opts = { allowedOrigins: [APP, 'https://admin.example.com'] };
const safe = (next, o = opts) => solution.safeRedirect(next, o);

describe('relative paths', () => {
  it('passes ordinary paths through, normalised', () => {
    expect(safe('/invoices/42')).toBe('/invoices/42');
    expect(safe('/search?q=a+b&page=2#results')).toBe('/search?q=a+b&page=2#results');
    expect(safe('/a/./b/../c')).toBe('/a/c');
    expect(safe('/')).toBe('/');
    expect(safe('/%2F%2Fevil.io')).toBe('/%2F%2Fevil.io');
  });

  it('rejects protocol-relative and backslash tricks', () => {
    for (const next of ['//evil.io', '//evil.io/login', '///evil.io', '/\\evil.io', '/\\/evil.io', '\\\\evil.io', '\\/evil.io']) {
      expect(safe(next)).toBe('/');
    }
  });

  it('rejects control characters that browsers would strip', () => {
    for (const next of ['/\t/evil.io', '/\n/evil.io', '/\r\n/evil.io', '/ok\r\nSet-Cookie: a=b', '/ok\x00', '/ok\x7f', '/\x0b/evil.io']) {
      expect(safe(next)).toBe('/');
    }
  });

  it('uses the fallback you give it', () => {
    expect(solution.safeRedirect('//evil.io', { fallback: '/dashboard' })).toBe('/dashboard');
    expect(solution.safeRedirect(undefined, { fallback: '/home' })).toBe('/home');
    expect(solution.safeRedirect('/ok')).toBe('/ok');
  });

  it('rejects non-strings and absurd lengths', () => {
    for (const next of [undefined, null, 42, ['/ok'], { toString: () => '/ok' }]) expect(safe(next)).toBe('/');
    expect(safe('/' + 'a'.repeat(2047))).toBe('/' + 'a'.repeat(2047));
    expect(safe('/' + 'a'.repeat(2048))).toBe('/');
  });
});

describe('absolute URLs', () => {
  it('allows exactly the listed origins, normalised', () => {
    expect(safe('https://app.example.com/billing?x=1')).toBe('https://app.example.com/billing?x=1');
    expect(safe('HTTPS://APP.EXAMPLE.COM/x')).toBe('https://app.example.com/x');
    expect(safe('https://app.example.com:443/x')).toBe('https://app.example.com/x');
    expect(safe('https://admin.example.com')).toBe('https://admin.example.com/');
  });

  it('rejects look-alike hosts, userinfo and other ports or schemes', () => {
    for (const next of [
      'https://app.example.com.evil.io/',
      'https://app.example.com@evil.io/',
      'https://evil.io/?https://app.example.com',
      'https://evil.io#https://app.example.com',
      'https://user:pw@app.example.com/',
      'https://user@app.example.com/',
      'https://app.example.com:444/',
      'http://app.example.com/',
      'https://example.com/',
      'https://sub.app.example.com/',
      'javascript:alert(1)',
      'JavaScript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'https:evil.io',
      'evil.io',
      ' https://evil.io',
      '',
    ]) {
      expect(safe(next)).toBe('/');
    }
  });

  it('allows nothing absolute by default', () => {
    expect(solution.safeRedirect('https://app.example.com/x')).toBe('/');
  });
});

describe('createServer', () => {
  const hit = async (query) => {
    const server = solution.createServer(opts);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${query}`, { redirect: 'manual' });
      return { status: res.status, location: res.headers.get('location'), cache: res.headers.get('cache-control'), body: await res.text() };
    } finally {
      await new Promise((r) => server.close(r));
    }
  };

  it('redirects to a safe next with 303 and no-store', async () => {
    const r = await hit('/continue?next=' + encodeURIComponent('/invoices/42?tab=paid'));
    expect(r.status).toBe(303);
    expect(r.location).toBe('/invoices/42?tab=paid');
    expect(r.cache).toBe('no-store');
    expect(r.body).toBe('');
  });

  it('decodes the query parameter before checking it', async () => {
    expect((await hit('/continue?next=%2F%2Fevil.io')).location).toBe('/');
    expect((await hit('/continue?next=%2F%09%2Fevil.io')).location).toBe('/');
    expect((await hit('/continue?next=%2F%5Cevil.io')).location).toBe('/');
    expect((await hit('/continue?next=' + encodeURIComponent('https://app.example.com/x'))).location).toBe('https://app.example.com/x');
  });

  it('falls back to / without a next', async () => {
    const r = await hit('/continue');
    expect(r.status).toBe(303);
    expect(r.location).toBe('/');
  });

  it('404s anything else', async () => {
    expect((await hit('/elsewhere?next=/x')).status).toBe(404);
  });
});
