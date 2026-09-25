export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type ApiErrorKind = 'network' | 'http' | 'parse' | 'validation';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly method: string,
    readonly url: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ApiError';
  }
}

export class HttpError extends ApiError {
  readonly status: number;
  /** The start of the response body, for logs. Never shown to users. */
  readonly body: string;
  constructor(method: string, url: string, status: number, body: string) {
    super('http', method, url, `${method} ${url} failed with ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body.slice(0, 200);
  }
  get retryable(): boolean {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export async function fetchJson<T>(
  fetchFn: FetchFn,
  url: string,
  parse: (body: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const where = `${method} ${url}`;

  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch (cause) {
    throw new ApiError('network', method, url, `Network error calling ${where}`, { cause });
  }

  // Read the body once, as text: an error page from a proxy is HTML, not JSON.
  let text: string;
  try {
    text = await res.text();
  } catch (cause) {
    throw new ApiError('network', method, url, `Network error calling ${where}`, { cause });
  }
  // fetch only rejects when there is no response at all; a 404 or 500 resolves.
  if (!res.ok) throw new HttpError(method, url, res.status, text);

  let body: unknown;
  if (text !== '') {
    try {
      body = JSON.parse(text);
    } catch (cause) {
      throw new ApiError('parse', method, url, `Invalid JSON from ${where}`, { cause });
    }
  }

  try {
    return parse(body);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ApiError('validation', method, url, `Unexpected response shape from ${where}: ${detail}`, { cause });
  }
}

/** What to tell the user. The details stay in the error for the logs. */
export function describeFailure(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong.';
  switch (error.kind) {
    case 'network':
      return 'You appear to be offline.';
    case 'http': {
      if (!(error instanceof HttpError)) return 'Request failed.';
      if (error.status === 401) return 'Please sign in again.';
      if (error.status === 404) return 'Not found.';
      return error.retryable ? 'The service is busy. Try again shortly.' : 'Request failed.';
    }
    case 'parse':
    case 'validation':
      return 'Unexpected response from the server.';
  }
}
