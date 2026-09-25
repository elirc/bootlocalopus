import http from 'node:http';

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

/** Answers the scripted responses in order, repeating the last one. */
const script = (...responses) => (n) => responses[Math.min(n, responses.length) - 1];

/** A client whose sleeps are recorded instead of waited for. */
function clientFor(baseUrl, options = {}) {
  const sleeps = [];
  const client = solution.createRatesClient({ baseUrl, apiKey: 'key-123', sleep: async (ms) => { sleeps.push(ms); }, ...options });
  return { client, sleeps };
}

/** Awaits a rejection and returns the error, so its fields can be asserted. */
async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

const ok = (rate) => ({ status: 200, body: { rate } });

describe('the request', () => {
  it('sends GET /rates with the pair in the query and a Bearer token', async () => {
    await withStub(script(ok(0.9)), async ({ baseUrl, requests }) => {
      const { client } = clientFor(baseUrl);
      expect(await client.getRate('USD', 'EUR')).toBe(0.9);
      expect(requests).toHaveLength(1);
      const [req] = requests;
      expect(req.method).toBe('GET');
      expect(req.url.pathname).toBe('/rates');
      expect(req.url.searchParams.get('from')).toBe('USD');
      expect(req.url.searchParams.get('to')).toBe('EUR');
      expect(req.headers.authorization).toBe('Bearer key-123');
    });
  });
});

describe('answers that are final', () => {
  it('resolves to null on 404, without retrying', async () => {
    await withStub(script({ status: 404, body: { error: 'unknown pair' } }), async ({ baseUrl, requests }) => {
      const { client, sleeps } = clientFor(baseUrl);
      expect(await client.getRate('USD', 'XXX')).toBe(null);
      expect(requests).toHaveLength(1);
      expect(sleeps).toEqual([]);
    });
  });

  it('rejects a 401 as not retryable, after one request', async () => {
    await withStub(script({ status: 401 }), async ({ baseUrl, requests }) => {
      const { client, sleeps } = clientFor(baseUrl);
      const error = await rejection(client.getRate('USD', 'EUR'));
      expect(error).toBeInstanceOf(solution.UpstreamError);
      expect(error.status).toBe(401);
      expect(error.retryable).toBe(false);
      expect(requests).toHaveLength(1);
      expect(sleeps).toEqual([]);
    });
  });

  it('rejects a 200 whose rate is not a number', async () => {
    for (const body of [{ rate: '0.91' }, { rate: null }, {}]) {
      await withStub(script({ status: 200, body }), async ({ baseUrl }) => {
        const { client } = clientFor(baseUrl);
        const error = await rejection(client.getRate('USD', 'EUR'));
        expect(error).toBeInstanceOf(solution.UpstreamError);
        expect(error.status).toBe(200);
        expect(error.retryable).toBe(false);
      });
    }
  });
});

describe('retries', () => {
  it('retries a 503 with exponential backoff and returns the eventual rate', async () => {
    await withStub(script({ status: 503 }, { status: 503 }, ok(1.1)), async ({ baseUrl, requests }) => {
      const { client, sleeps } = clientFor(baseUrl);
      expect(await client.getRate('USD', 'EUR')).toBe(1.1);
      expect(requests).toHaveLength(3);
      expect(sleeps).toEqual([100, 200]);
    });
  });

  it('gives up after maxAttempts, without a sleep after the last one', async () => {
    await withStub(script({ status: 500 }), async ({ baseUrl, requests }) => {
      const { client, sleeps } = clientFor(baseUrl, { maxAttempts: 3 });
      const error = await rejection(client.getRate('USD', 'EUR'));
      expect(error).toBeInstanceOf(solution.UpstreamError);
      expect(error.status).toBe(500);
      expect(error.retryable).toBe(true);
      expect(requests).toHaveLength(3);
      expect(sleeps).toEqual([100, 200]);
    });
  });

  it('waits for Retry-After on a 429', async () => {
    await withStub(script({ status: 429, headers: { 'retry-after': '30' } }, ok(0.8)), async ({ baseUrl, requests }) => {
      const { client, sleeps } = clientFor(baseUrl);
      expect(await client.getRate('USD', 'EUR')).toBe(0.8);
      expect(requests).toHaveLength(2);
      expect(sleeps).toEqual([30_000]);
    });
  });
});
