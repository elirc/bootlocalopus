import http from 'node:http';

const cd = (name, opts) => solution.contentDisposition(name, opts);

describe('contentDisposition', () => {
  it('uses a plain quoted filename for simple ASCII names', () => {
    expect(cd('report.csv')).toBe('attachment; filename="report.csv"');
    expect(cd('Q3 report (final) v2.csv')).toBe('attachment; filename="Q3 report (final) v2.csv"');
    expect(cd("it's *done*.txt")).toBe('attachment; filename="it\'s *done*.txt"');
  });

  it('supports inline', () => {
    expect(cd('invoice.pdf', { inline: true })).toBe('inline; filename="invoice.pdf"');
    expect(cd('März.pdf', { inline: true }).startsWith('inline; filename="M_rz.pdf"; ')).toBe(true);
  });

  it('adds an RFC 8187 filename* for non-ASCII names, with an ASCII fallback', () => {
    expect(cd('Rechnung März.pdf'))
      .toBe('attachment; filename="Rechnung M_rz.pdf"; filename*=UTF-8\'\'Rechnung%20M%C3%A4rz.pdf');
    expect(cd('Straße Q3 €.pdf'))
      .toBe('attachment; filename="Stra_e Q3 _.pdf"; filename*=UTF-8\'\'Stra%C3%9Fe%20Q3%20%E2%82%AC.pdf');
  });

  it('replaces one emoji with one underscore', () => {
    expect(cd('📄 notes.txt')).toBe('attachment; filename="_ notes.txt"; filename*=UTF-8\'\'%F0%9F%93%84%20notes.txt');
  });

  it('encodes \' ( ) * in filename*, which encodeURIComponent leaves alone', () => {
    expect(cd("café (it's) *v2*.txt"))
      .toBe('attachment; filename="caf_ (it\'s) *v2*.txt"; filename*=UTF-8\'\'caf%C3%A9%20%28it%27s%29%20%2Av2%2A.txt');
  });

  it('never puts ", \\ or % in the plain filename', () => {
    expect(cd('say "hi".txt')).toBe('attachment; filename="say _hi_.txt"; filename*=UTF-8\'\'say%20%22hi%22.txt');
    expect(cd('50% off.txt')).toBe('attachment; filename="50_ off.txt"; filename*=UTF-8\'\'50%25%20off.txt');
    expect(cd('a\\b"c')).toBe('attachment; filename="b_c"; filename*=UTF-8\'\'b%22c');
  });

  it('keeps only the last path segment', () => {
    expect(cd('../../etc/passwd')).toBe('attachment; filename="passwd"');
    expect(cd('C:\\Users\\me\\Desktop\\budget.xlsx')).toBe('attachment; filename="budget.xlsx"');
  });

  it('removes control characters and surrounding spaces', () => {
    expect(cd('evil\r\nSet-Cookie: admin=1.txt')).toBe('attachment; filename="evilSet-Cookie: admin=1.txt"');
    expect(cd('  tab\there.txt  ')).toBe('attachment; filename="tabhere.txt"');
    expect(cd('bell\u0007\u007f.txt')).toBe('attachment; filename="bell.txt"');
  });

  it('falls back to "download" when nothing is left', () => {
    expect(cd('')).toBe('attachment; filename="download"');
    expect(cd('../')).toBe('attachment; filename="download"');
    expect(cd('\r\n')).toBe('attachment; filename="download"');
  });
});

describe('createDownloadHandler', () => {
  const files = {
    '1': { name: 'Rechnung März.pdf', type: 'application/pdf', body: '%PDF-1.7' },
    '2': { name: 'x\r\nSet-Cookie: session=stolen\r\n.csv', type: 'text/csv', body: 'a,b\n' },
  };

  const withServer = async (fn) => {
    const server = http.createServer(solution.createDownloadHandler((id) => files[id]));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      return await fn(base);
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  };

  it('sends the file with its Content-Disposition', () => withServer(async (base) => {
    const res = await fetch(`${base}/download/1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(cd('Rechnung März.pdf'));
    expect(await res.text()).toBe('%PDF-1.7');
  }));

  it('survives a hostile name without a 500 or an injected header', () => withServer(async (base) => {
    const res = await fetch(`${base}/download/2`);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="xSet-Cookie: session=stolen.csv"');
  }));

  it('answers 404 for unknown files', () => withServer(async (base) => {
    expect((await fetch(`${base}/download/99`)).status).toBe(404);
  }));
});
