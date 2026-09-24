export class HttpError extends Error {
  constructor(method, path, status, body) {
    super(method + ' ' + path + ' failed with ' + status);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export function createClient({
  baseUrl = '',
  fetch: fetchImpl = fetch,
  timeoutMs = 1000,
  retries = 2,
  backoff = () => 0,
} = {}) {
  const parse = async (res) => {
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const request = async (method, path, { body, signal, headers } = {}) => {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal?.aborted) throw signal.reason ?? new Error('aborted');

      // A fresh timeout per attempt; the caller's signal cancels the whole thing.
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

      try {
        const res = await fetchImpl(baseUrl + path, {
          method,
          signal: combined,
          headers: {
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...headers,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });

        if (res.ok) return await parse(res);

        const error = new HttpError(method, path, res.status, await parse(res));
        // 4xx will fail identically next time; only server errors are worth a retry.
        if (res.status < 500 || attempt === retries) throw error;
        lastError = error;
      } catch (err) {
        if (err instanceof HttpError && err.status < 500) throw err;
        if (signal?.aborted) throw signal.reason ?? err;
        if (attempt === retries) throw err;
        lastError = err;
      }

      await backoff(attempt + 1);
    }

    throw lastError;
  };

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
  };
}
