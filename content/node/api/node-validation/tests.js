const parse = (query) => solution.parsePagination(new URLSearchParams(query));
const failure = (query) => {
  try {
    parse(query);
    return null;
  } catch (e) { return e; }
};

const start = async () => {
  const server = solution.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    get: (path) => fetch('http://127.0.0.1:' + port + path),
    close: () => new Promise((r) => server.close(r)),
  };
};

describe('defaults', () => {
  it('applies every default for an empty query', () => {
    expect(parse('')).toEqual({ limit: 20, offset: 0, sort: 'createdAt', direction: 'desc' });
  });
  it('parses valid values', () => {
    expect(parse('limit=50&offset=100&sort=name&direction=asc')).toEqual({
      limit: 50, offset: 100, sort: 'name', direction: 'asc',
    });
  });
  it('accepts the boundary values', () => {
    expect(parse('limit=1').limit).toBe(1);
    expect(parse('limit=100').limit).toBe(100);
    expect(parse('offset=0').offset).toBe(0);
  });
  it('accepts direction in any case', () => {
    expect(parse('direction=ASC').direction).toBe('asc');
    expect(parse('direction=Desc').direction).toBe('desc');
  });
  it('ignores unknown parameters', () => {
    expect(parse('utm_source=twitter&limit=5').limit).toBe(5);
  });
});

describe('validation', () => {
  it('rejects a non-numeric limit', () => {
    const err = failure('limit=abc');
    expect(err?.status).toBe(400);
    expect(err.fields.limit).toBeTruthy();
  });

  it('rejects a partially numeric limit rather than truncating it', () => {
    // parseInt("12abc") === 12 is exactly the silent bug we are avoiding.
    expect(failure('limit=12abc')?.status).toBe(400);
  });

  it('rejects a limit below the minimum', () => {
    expect(failure('limit=0')?.fields.limit).toBeTruthy();
    expect(failure('limit=-5')?.fields.limit).toBeTruthy();
  });

  it('rejects a limit above the maximum instead of clamping', () => {
    const err = failure('limit=5000');
    expect(err?.status).toBe(400);
    expect(err.fields.limit).toBeTruthy();
  });

  it('rejects a negative offset', () => {
    expect(failure('offset=-1')?.fields.offset).toBeTruthy();
  });

  it('rejects an unknown sort column', () => {
    const err = failure('sort=password');
    expect(err?.fields.sort).toBeTruthy();
  });

  it('rejects an unknown direction', () => {
    expect(failure('direction=sideways')?.fields.direction).toBeTruthy();
  });

  it('reports every problem at once', () => {
    const err = failure('limit=abc&offset=-2&sort=nope&direction=up');
    expect(err?.status).toBe(400);
    expect(Object.keys(err.fields).sort()).toEqual(['direction', 'limit', 'offset', 'sort']);
  });

  it('does not reject a float-looking limit as valid', () => {
    expect(failure('limit=10.5')?.status).toBe(400);
  });
});

describe('the endpoint', () => {
  it('returns the parsed options', async () => {
    const app = await start();
    try {
      const res = await app.get('/items?limit=5&sort=score');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ limit: 5, offset: 0, sort: 'score', direction: 'desc' });
    } finally { await app.close(); }
  });

  it('returns 400 with the offending fields', async () => {
    const app = await start();
    try {
      const res = await app.get('/items?limit=nope&sort=bad');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('invalid query');
      expect(Object.keys(body.fields).sort()).toEqual(['limit', 'sort']);
    } finally { await app.close(); }
  });
});