export const ERROR_CODES = {
  UNAUTHENTICATED: { status: 401, title: 'Unauthorized', expose: true },
  FORBIDDEN: { status: 403, title: 'Forbidden', expose: true },
  NOT_FOUND: { status: 404, title: 'Not Found', expose: true },
  CONFLICT: { status: 409, title: 'Conflict', expose: true },
  VALIDATION: { status: 422, title: 'Unprocessable Content', expose: true },
  RATE_LIMITED: { status: 429, title: 'Too Many Requests', expose: true },
  INTERNAL: { status: 500, title: 'Internal Server Error', expose: false },
} as const satisfies Record<string, { status: number; title: string; expose: boolean }>;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, options: { cause?: unknown; details?: Record<string, unknown> } = {}) {
    // Only pass `cause` when given, so `'cause' in err` means something.
    super(message, 'cause' in options ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.details = options.details;
  }
}

export function isAppError(value: unknown, code?: ErrorCode): value is AppError {
  return value instanceof AppError && (code === undefined || value.code === code);
}

/** The first AppError in the cause chain, starting with `value` itself. Cycles end the walk. */
export function findAppError(value: unknown): AppError | undefined {
  const seen = new Set<unknown>();
  let current = value;
  while (current instanceof Error && !seen.has(current)) {
    if (current instanceof AppError) return current;
    seen.add(current);
    current = current.cause;
  }
  return undefined;
}

const INTERNAL: Problem = { type: 'about:blank', title: 'Internal Server Error', status: 500 };

/** An RFC 9457 problem body. Anything we did not deliberately expose becomes a bare 500. */
export function toProblem(value: unknown, instance?: string): Problem {
  const appError = findAppError(value);
  const spec = appError ? ERROR_CODES[appError.code] : undefined;
  const problem: Problem = appError && spec?.expose
    ? {
        type: `https://errors.example.com/${appError.code.toLowerCase().replaceAll('_', '-')}`,
        title: spec.title,
        status: spec.status,
        detail: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
      }
    : { ...INTERNAL };
  if (instance !== undefined) problem.instance = instance;
  return problem;
}
