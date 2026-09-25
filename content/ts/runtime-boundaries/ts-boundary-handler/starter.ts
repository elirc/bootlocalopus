export interface Req {
  method: string;
  path: string;
  /** Header names are lowercase. */
  headers: Record<string, string | undefined>;
  body: string;
}

export interface Res {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface Issue { path: string; message: string }

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  requestId: string;
  method: string;
  path: string;
  status: number;
  error?: string;
}

export interface HandlerOptions<T, Out> {
  method: string;
  parse: (body: unknown) => ParseResult<T>;
  handle: (input: T, ctx: { requestId: string }) => Out | Promise<Out>;
  log: (entry: LogEntry) => void;
  requestId: () => string;
  maxBodyBytes?: number;
  successStatus?: number;
}

export class ClientError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ClientError';
  }
}

export function createJsonHandler<T, Out>(options: HandlerOptions<T, Out>): (req: Req) => Promise<Res> {
  return async (req) => {
    // TODO: every check in the brief. This trusts the body and leaks every error.
    try {
      const out = await options.handle(JSON.parse(req.body) as T, { requestId: '' });
      return { status: 200, headers: {}, body: JSON.stringify(out) };
    } catch (e) {
      return { status: 500, headers: {}, body: JSON.stringify({ error: String(e) }) };
    }
  };
}
