const start = async () => {
  const server = solution.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    server,
    url: (path) => 'http://127.0.0.1:' + port + path,
    close: () => new Promise((r) => server.close(r)),
  };
};

describe('routing', () => {
  it('serves GET /health', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/health'));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({ status: 'ok' });
    } finally { await app.close(); }
  });

  it('ignores the query string', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/health?verbose=1&x=2'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    } finally { await app.close(); }
  });

  it('lists users', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/users'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([{ id: '1', name: 'ada' }, { id: '2', name: 'bob' }]);
    } finally { await app.close(); }
  });

  it('serves one user by id', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/users/2'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: '2', name: 'bob' });
    } finally { await app.close(); }
  });

  it('404s an unknown user', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/users/999'));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not found' });
    } finally { await app.close(); }
  });

  it('404s an unknown path with JSON, not HTML', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/nope'));
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({ error: 'not found' });
    } finally { await app.close(); }
  });

  it('does not treat a nested path as a user id', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/users/1/posts'));
      expect(res.status).toBe(404);
    } finally { await app.close(); }
  });

  it('405s a wrong method on a route that exists, and says what is allowed', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/users'), { method: 'POST' });
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('GET');
    } finally { await app.close(); }
  });

  it('405s a wrong method on /health too', async () => {
    const app = await start();
    try {
      const res = await fetch(app.url('/health'), { method: 'DELETE' });
      expect(res.status).toBe(405);
    } finally { await app.close(); }
  });
});