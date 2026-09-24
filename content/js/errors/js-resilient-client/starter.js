export class HttpError extends Error {
  constructor(method, path, status, body) {
    super(method + ' ' + path + ' failed with ' + status);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export function createClient({ baseUrl = '', fetch: fetchImpl = fetch, timeoutMs = 1000, retries = 2, backoff = () => 0 } = {}) {
  // TODO: one request() helper, then get/post on top of it
  return {
    get(path, opts) {},
    post(path, body, opts) {},
  };
}
