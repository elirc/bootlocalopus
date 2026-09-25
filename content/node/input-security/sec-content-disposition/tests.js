const cd = (name, opts) => solution.contentDisposition(name, opts);

describe('contentDisposition', () => {
  it('keeps plain ASCII names as a single quoted parameter', () => {
    expect(cd('report.pdf')).toBe('attachment; filename="report.pdf"');
    expect(cd('Q3 report (final) v2.pdf')).toBe('attachment; filename="Q3 report (final) v2.pdf"');
    expect(cd('report.pdf', { inline: true })).toBe('inline; filename="report.pdf"');
  });

  it('adds an RFC 5987 filename* for non-ASCII names', () => {
    expect(cd('Résumé.pdf')).toBe(`attachment; filename="R_sum_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9.pdf`);
    expect(cd('日本.txt')).toBe(`attachment; filename="__.txt"; filename*=UTF-8''%E6%97%A5%E6%9C%AC.txt`);
  });

  it('replaces an emoji with a single underscore (code points, not UTF-16 units)', () => {
    expect(cd('📄 notes.md')).toBe(`attachment; filename="_ notes.md"; filename*=UTF-8''%F0%9F%93%84%20notes.md`);
  });

  it('cannot be broken out of with quotes or backslashes', () => {
    expect(cd(`x.txt"; filename*=UTF-8''payload.html`)).toBe(
      `attachment; filename="x.txt_; filename*=UTF-8''payload.html"; filename*=UTF-8''x.txt%22%3B%20filename%2A%3DUTF-8%27%27payload.html`,
    );
    expect(cd('a"b.txt')).toBe(`attachment; filename="a_b.txt"; filename*=UTF-8''a%22b.txt`);
  });

  it('encodes the characters encodeURIComponent leaves alone', () => {
    expect(cd("it's (a) *draft*.txt")).toBe(`attachment; filename="it's (a) *draft*.txt"`);
    expect(cd("it's é (a)*.txt")).toBe(`attachment; filename="it's _ (a)*.txt"; filename*=UTF-8''it%27s%20%C3%A9%20%28a%29%2A.txt`);
  });

  it('treats % as unsafe in the fallback', () => {
    expect(cd('100%25.txt')).toBe(`attachment; filename="100_25.txt"; filename*=UTF-8''100%2525.txt`);
  });

  it('strips directories, both kinds of slash', () => {
    expect(cd('../../etc/passwd')).toBe('attachment; filename="passwd"');
    expect(cd('..\\..\\AppData\\evil.bat')).toBe('attachment; filename="evil.bat"');
    expect(cd('C:\\Users\\me\\a.txt')).toBe('attachment; filename="a.txt"');
    expect(cd('dir/')).toBe('attachment; filename="download"');
  });

  it('removes control characters, so CR/LF can never reach the header', () => {
    expect(cd('a\r\nSet-Cookie: x=1.txt')).toBe('attachment; filename="aSet-Cookie: x=1.txt"');
    expect(cd('tab\there.txt')).toBe('attachment; filename="tabhere.txt"');
    expect(cd('bell\x07\x7f.txt')).toBe('attachment; filename="bell.txt"');
  });

  it('falls back to "download" for empty or non-string names', () => {
    for (const name of ['', '   ', '\r\n', undefined, null, 42, {}]) {
      expect(cd(name)).toBe('attachment; filename="download"');
    }
    expect(cd('  spaced.txt  ')).toBe('attachment; filename="spaced.txt"');
  });

  it('survives a lone surrogate', () => {
    expect(cd('bad\uD800.txt')).toBe(`attachment; filename="bad_.txt"; filename*=UTF-8''bad%EF%BF%BD.txt`);
  });
});

describe('createDownloadServer', () => {
  const files = new Map([
    ['1', { name: 'Résumé.pdf', type: 'application/pdf', body: Buffer.from('%PDF-1.7') }],
    ['2', { name: 'evil\r\nX-Injected: yes.html', type: 'text/plain', body: 'hi' }],
    ['3', { name: 'safe.txt', type: 'text/plain; charset=utf-8', body: 'plain text' }],
  ]);

  const get = async (p, method = 'GET') => {
    const server = solution.createDownloadServer(files);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${p}`, { method });
      return { status: res.status, headers: res.headers, body: await res.text() };
    } finally {
      await new Promise((r) => server.close(r));
    }
  };

  it('serves a file as an attachment with nosniff', async () => {
    const r = await get('/download/1');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-disposition')).toBe(`attachment; filename="R_sum_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9.pdf`);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.body).toBe('%PDF-1.7');
  });

  it('serves a name containing CR/LF instead of crashing, with no injected header', async () => {
    const r = await get('/download/2');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-injected')).toBeNull();
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="evilX-Injected: yes.html"');
    expect(r.body).toBe('hi');
  });

  it('404s unknown ids and other requests with no body', async () => {
    for (const [p, m] of [['/download/9', 'GET'], ['/download/', 'GET'], ['/elsewhere', 'GET'], ['/download/3', 'DELETE']]) {
      const r = await get(p, m);
      expect(r.status).toBe(404);
      expect(r.body).toBe('');
    }
  });
});
