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
  // TODO: status, body (first 200 characters), retryable
}

// The usual version: a 404 resolves, an HTML error page throws a SyntaxError,
// and whatever the server sent is returned as T without being checked.
export async function fetchJson<T>(
  fetchFn: FetchFn,
  url: string,
  parse: (body: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const res = await fetchFn(url, init);
  return (await res.json()) as T;
}

export function describeFailure(error: unknown): string {
  // TODO
  return 'Something went wrong.';
}
