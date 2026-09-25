export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

function parseCacheControl(header) {
  const directives = new Map();
  for (const part of (header ?? '').split(',')) {
    const [name, value] = part.trim().toLowerCase().split('=');
    if (name) directives.set(name, value);
  }
  const maxAge = directives.has('max-age') ? Number.parseInt(directives.get('max-age'), 10) : undefined;
  return {
    noStore: directives.has('no-store'),
    noCache: directives.has('no-cache'),
    maxAge: Number.isFinite(maxAge) ? maxAge : undefined,
  };
}

export function createHttpCache({ fetch, now = Date.now }) {
  const entries = new Map(); // url -> { data, etag, freshUntil }
  const inflight = new Map(); // url -> Promise<data>

  const freshUntilFrom = (cc) =>
    cc.maxAge !== undefined && cc.maxAge > 0 && !cc.noCache ? now() + cc.maxAge * 1000 : 0;

  async function load(url) {
    const stored = entries.get(url);
    const headers = {};
    if (stored?.etag) headers['if-none-match'] = stored.etag;

    const response = await fetch(url, { headers });
    const cc = parseCacheControl(response.headers.get('cache-control'));

    // 304 before `ok`: a 304 is not 2xx, but it is the cache working.
    if (response.status === 304 && stored) {
      stored.freshUntil = freshUntilFrom(cc);
      return stored.data;
    }
    if (response.status !== 200) throw new HttpError(response.status, url);

    const data = await response.json();
    const etag = response.headers.get('etag');
    if (cc.noStore || (!etag && !(cc.maxAge > 0))) entries.delete(url);
    else entries.set(url, { data, etag, freshUntil: freshUntilFrom(cc) });
    return data;
  }

  return {
    async get(url) {
      const stored = entries.get(url);
      if (stored && now() < stored.freshUntil) return structuredClone(stored.data);

      let pending = inflight.get(url);
      if (!pending) {
        pending = load(url).finally(() => inflight.delete(url));
        inflight.set(url, pending);
      }
      // Every caller gets its own copy; the cached object never leaves.
      return structuredClone(await pending);
    },
  };
}
