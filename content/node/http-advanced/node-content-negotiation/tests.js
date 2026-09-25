import http from 'node:http';

const withServer = async (handler, fn) => {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
};

const JSON_CSV = ['application/json', 'text/csv'];

describe('negotiate', () => {
  it('returns the first available type when there is no Accept header', () => {
    expect(solution.negotiate(undefined, JSON_CSV)).toBe('application/json');
    expect(solution.negotiate('', JSON_CSV)).toBe('application/json');
    expect(solution.negotiate('   ', ['text/csv', 'application/json'])).toBe('text/csv');
  });

  it('picks an exact match, case-insensitively and ignoring whitespace', () => {
    expect(solution.negotiate('text/csv', JSON_CSV)).toBe('text/csv');
    expect(solution.negotiate('  TEXT/CSV ; charset=utf-8 ', JSON_CSV)).toBe('text/csv');
    expect(solution.negotiate('text/csv', ['application/json', 'Text/CSV'])).toBe('Text/CSV');
  });

  it('uses q values and prefers the higher one', () => {
    expect(solution.negotiate('application/json;q=0.5, text/csv;q=0.8', JSON_CSV)).toBe('text/csv');
    expect(solution.negotiate('application/json;q=0.8, text/csv;q=0.5', JSON_CSV)).toBe('application/json');
    expect(solution.negotiate('text/csv;q=0.1', JSON_CSV)).toBe('text/csv');
  });

  it('breaks ties by server preference', () => {
    expect(solution.negotiate('text/csv, application/json', JSON_CSV)).toBe('application/json');
    expect(solution.negotiate('*/*', ['text/csv', 'application/json'])).toBe('text/csv');
  });

  it('treats q=0 as "not acceptable", even under a wildcard', () => {
    expect(solution.negotiate('text/csv;q=0, */*', JSON_CSV)).toBe('application/json');
    expect(solution.negotiate('application/json;q=0, */*;q=0.1', JSON_CSV)).toBe('text/csv');
    expect(solution.negotiate('application/json;q=0, text/csv;q=0', JSON_CSV)).toBeNull();
    expect(solution.negotiate('*/*;q=0', JSON_CSV)).toBeNull();
  });

  it('lets the most specific matching range decide', () => {
    const accept = 'text/*;q=0.2, text/csv;q=0.9, */*;q=0.5';
    expect(solution.negotiate(accept, ['text/html', 'text/csv'])).toBe('text/csv');
    expect(solution.negotiate(accept, ['text/html', 'application/json'])).toBe('application/json');
    expect(solution.negotiate('text/*;q=0.3, */*;q=0.4', ['text/csv', 'application/json'])).toBe('application/json');
  });

  it('returns null when nothing matches', () => {
    expect(solution.negotiate('image/png', JSON_CSV)).toBeNull();
    expect(solution.negotiate('text/html, application/xml;q=0.9', JSON_CSV)).toBeNull();
  });

  it('ignores ranges with an invalid q', () => {
    expect(solution.negotiate('text/csv;q=2, application/json;q=0.1', JSON_CSV)).toBe('application/json');
    expect(solution.negotiate('text/csv;q=abc', JSON_CSV)).toBeNull();
    expect(solution.negotiate('text/csv;q=-1, */*;q=0.2', JSON_CSV)).toBe('application/json');
  });
});

describe('createReportHandler', () => {
  const rows = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }];
  const handler = () => solution.createReportHandler(() => rows);

  it('serves JSON by default, with Vary: Accept', () => withServer(handler(), async (base) => {
    const res = await fetch(`${base}/report`, { headers: { accept: '*/*' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('vary')).toBe('Accept');
    expect(await res.json()).toEqual(rows);
  }));

  it('serves CSV when asked for it', () => withServer(handler(), async (base) => {
    const res = await fetch(`${base}/report?month=2024-05`, { headers: { accept: 'text/csv' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('vary')).toBe('Accept');
    expect(await res.text()).toBe('id,name\n1,Ada\n2,Grace\n');
  }));

  it('answers 406 with the available types, still with Vary', () => withServer(handler(), async (base) => {
    const res = await fetch(`${base}/report`, { headers: { accept: 'text/html' } });
    expect(res.status).toBe(406);
    expect(res.headers.get('vary')).toBe('Accept');
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await res.json()).toEqual({ error: 'not acceptable', available: ['application/json', 'text/csv'] });
  }));

  it('answers 404 elsewhere', () => withServer(handler(), async (base) => {
    expect((await fetch(`${base}/reports`)).status).toBe(404);
    const post = await fetch(`${base}/report`, { method: 'POST' });
    expect(post.status).toBe(404);
    expect(await post.json()).toEqual({ error: 'not found' });
  }));
});
