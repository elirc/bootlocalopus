export type ApiError =
  | { kind: 'network'; cause: unknown }
  | { kind: 'http'; status: number; body: string }
  | { kind: 'parse'; message: string };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

/** Turns untrusted JSON into a T, or throws. */
export type Parser<T> = (data: unknown) => T;

export interface ClientOptions {
  baseUrl: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  headers?: Record<string, string>;
}

export interface ApiClient {
  get<T>(path: string, parse: Parser<T>): Promise<ApiResult<T>>;
  post<T>(path: string, body: unknown, parse: Parser<T>): Promise<ApiResult<T>>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createClient(options: ClientOptions): ApiClient {
  const base = options.baseUrl.replace(/\/+$/, '');
  const urlFor = (path: string) => `${base}/${path.replace(/^\/+/, '')}`;

  async function request<T>(path: string, init: RequestInit, parse: Parser<T>): Promise<ApiResult<T>> {
    let response: Response;
    try {
      response = await options.fetch(urlFor(path), init);
    } catch (cause) {
      return { ok: false, error: { kind: 'network', cause } };
    }

    // Read the body as text once: error bodies are often not JSON.
    let text: string;
    try {
      text = await response.text();
    } catch (cause) {
      return { ok: false, error: { kind: 'network', cause } };
    }
    if (!response.ok) return { ok: false, error: { kind: 'http', status: response.status, body: text } };

    let data: unknown;
    try {
      data = text === '' ? undefined : JSON.parse(text);
    } catch (error) {
      return { ok: false, error: { kind: 'parse', message: messageOf(error) } };
    }
    try {
      return { ok: true, value: parse(data) };
    } catch (error) {
      return { ok: false, error: { kind: 'parse', message: messageOf(error) } };
    }
  }

  const headers = (extra: Record<string, string> = {}) => ({
    accept: 'application/json',
    ...options.headers,
    ...extra,
  });

  return {
    get: (path, parse) => request(path, { method: 'GET', headers: headers() }, parse),
    post: (path, body, parse) =>
      request(
        path,
        { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(body) },
        parse,
      ),
  };
}
