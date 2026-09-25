// Same behaviour: a precomputed attempt loop, a query string built by hand, different messages.
export class UpstreamError extends Error {
  constructor(status, retryable) {
    super('upstream failure');
    this.name = 'UpstreamError';
    Object.assign(this, { retryable, status });
  }
}

export function createRatesClient({ baseUrl, apiKey, maxAttempts = 3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const headers = { Accept: 'application/json', Authorization: 'Bearer ' + apiKey };

  const backoff = (attempt, res) => {
    if (res.status === 429) {
      const seconds = parseFloat(res.headers.get('Retry-After') ?? '');
      if (seconds > 0) return seconds * 1000;
    }
    return 100 * Math.pow(2, attempt - 1);
  };

  return {
    async getRate(from, to) {
      const url = `${base}/rates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      let attempt = 0;
      while (true) {
        attempt += 1;
        const res = await fetch(url, { headers });
        if (res.ok && res.status === 200) {
          const { rate } = await res.json();
          if (Number.isFinite(rate) && typeof rate === 'number') return rate;
          throw new UpstreamError(200, false);
        }
        await res.arrayBuffer();
        if (res.status === 404) return null;
        const retryable = res.status >= 500 || res.status === 429;
        if (!retryable) throw new UpstreamError(res.status, false);
        if (attempt === maxAttempts) throw new UpstreamError(res.status, true);
        await sleep(backoff(attempt, res));
      }
    },
  };
}
