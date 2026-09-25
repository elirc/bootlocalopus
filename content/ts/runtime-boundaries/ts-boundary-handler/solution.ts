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

/** Thrown on purpose by a handler: its status and message are safe to send. */
export class ClientError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ClientError';
  }
}

interface ProblemExtras { detail?: string; errors?: Issue[] }

export function createJsonHandler<T, Out>(options: HandlerOptions<T, Out>): (req: Req) => Promise<Res> {
  const maxBodyBytes = options.maxBodyBytes ?? 10_000;
  const successStatus = options.successStatus ?? 200;

  return async (req) => {
    const requestId = options.requestId();
    let logError: string | undefined;

    const problem = (status: number, title: string, extras: ProblemExtras = {}, headers: Record<string, string> = {}): Res => ({
      status,
      headers: { 'content-type': 'application/problem+json', ...headers },
      body: JSON.stringify({ type: 'about:blank', title, status, ...extras, requestId }),
    });

    async function run(): Promise<Res> {
      if (req.method.toUpperCase() !== options.method) {
        return problem(405, 'Method Not Allowed', {}, { allow: options.method });
      }
      const mediaType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (mediaType !== 'application/json') return problem(415, 'Unsupported Media Type');
      // Limits are in bytes, not characters: 'é' is one character and two bytes.
      if (Buffer.byteLength(req.body, 'utf8') > maxBodyBytes) return problem(413, 'Payload Too Large');

      let json: unknown;
      try {
        json = JSON.parse(req.body);
      } catch {
        return problem(400, 'Malformed JSON');
      }

      // Everything past here runs our code and the caller's; anything unexpected is a 500.
      try {
        const parsed = options.parse(json);
        if (!parsed.ok) return problem(422, 'Validation Failed', { errors: parsed.issues });

        const out = await options.handle(parsed.value, { requestId });
        if (out === undefined) return { status: 204, headers: {}, body: '' };
        // Serialising can throw (BigInt, cycles): keep it inside the try.
        const body = JSON.stringify(out);
        return { status: successStatus, headers: { 'content-type': 'application/json; charset=utf-8' }, body };
      } catch (error) {
        if (error instanceof ClientError) return problem(error.status, 'Request Failed', { detail: error.message });
        logError = error instanceof Error ? error.message : String(error);
        return problem(500, 'Internal Server Error');
      }
    }

    const res = await run();
    res.headers['x-request-id'] = requestId;
    const level = res.status >= 500 ? 'error' : res.status >= 400 ? 'warn' : 'info';
    const entry: LogEntry = { level, requestId, method: req.method, path: req.path, status: res.status };
    if (logError !== undefined) entry.error = logError;
    options.log(entry);
    return res;
  };
}
