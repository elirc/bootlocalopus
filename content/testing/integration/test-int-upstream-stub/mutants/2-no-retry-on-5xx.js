/** A failure talking to the rates provider. `retryable` says whether trying again later could help. */
export class UpstreamError extends Error {
  constructor(status, retryable) {
    super(`rates provider answered ${status}`);
    this.name = 'UpstreamError';
    this.status = status;
    this.retryable = retryable;
  }
}

const isRetryable = (status) => status === 429;

/**
 * A client for an exchange-rates API.
 * `sleep(ms)` is injected so tests do not wait for real backoff.
 */
export function createRatesClient({ baseUrl, apiKey, maxAttempts = 3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  async function getRate(from, to) {
    const url = new URL('/rates', baseUrl);
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);

    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' } });

      if (res.status === 200) {
        const body = await res.json();
        if (typeof body.rate !== 'number' || !Number.isFinite(body.rate)) throw new UpstreamError(200, false);
        return body.rate;
      }
      await res.body?.cancel(); // we do not need the error body; free the connection
      if (res.status === 404) return null; // the provider does not know this pair

      if (!isRetryable(res.status)) throw new UpstreamError(res.status, false);
      if (attempt >= maxAttempts) throw new UpstreamError(res.status, true);

      // Respect the provider's Retry-After (seconds) on a 429; otherwise back off exponentially.
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = res.status === 429 && retryAfter > 0 ? retryAfter * 1000 : 100 * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }

  return { getRate };
}
