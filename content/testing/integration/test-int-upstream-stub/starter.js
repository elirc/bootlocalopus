import http from 'node:http';

/**
 * A stub rates provider on a free port. `respond(n)` is called for the n-th request (1-based)
 * and returns { status, body?, headers? }. Every request is recorded; the server always closes.
 *   await withStub(() => ({ status: 200, body: { rate: 0.9 } }), async ({ baseUrl, requests }) => { ... });
 */
async function withStub(respond, fn) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: new URL(req.url, 'http://stub'), headers: req.headers });
    const { status, body, headers = {} } = respond(requests.length);
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    return await fn({ baseUrl: `http://localhost:${server.address().port}`, requests });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('getRate', () => {
  it('returns the rate', async () => {
    await withStub(() => ({ status: 200, body: { rate: 0.9 } }), async ({ baseUrl }) => {
      const client = solution.createRatesClient({ baseUrl, apiKey: 'k', sleep: async () => {} });
      expect(await client.getRate('USD', 'EUR')).toBe(0.9);
    });
  });

  // TODO: what was sent (path, query, auth), 404, a 401, retries on 503 and 429
  // (count requests and record sleeps), giving up, and a 200 with a bad body.
});
