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
  // TODO: code, status, details; name 'AppError'; cause passed to super
}

export function isAppError(value: unknown, code?: ErrorCode): value is AppError {
  // TODO
  return false;
}

export function findAppError(value: unknown): AppError | undefined {
  // TODO
  return undefined;
}

// The handler most apps start with: it sends every message to the client.
export function toProblem(value: unknown, instance?: string): Problem {
  const e = value as { status?: number; message?: string };
  return { type: 'about:blank', title: 'Error', status: e.status ?? 500, detail: e.message, instance };
}
