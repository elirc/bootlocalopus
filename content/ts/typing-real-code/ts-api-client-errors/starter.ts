export type ApiError =
  | { kind: 'network'; cause: unknown }
  | { kind: 'http'; status: number; body: string }
  | { kind: 'parse'; message: string };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

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

// The client every codebase starts with: it throws on anything unexpected, a
// 500 page is "parsed" as JSON, and the ApiResult type is a lie.
export function createClient(options: ClientOptions): ApiClient {
  return {
    async get(path, parse) {
      const response = await options.fetch(options.baseUrl + path, { method: 'GET' });
      return { ok: true, value: parse(await response.json()) };
    },
    async post(path, body, parse) {
      const response = await options.fetch(options.baseUrl + path, { method: 'POST', body: JSON.stringify(body) });
      return { ok: true, value: parse(await response.json()) };
    },
  };
}
