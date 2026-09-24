export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (resource, id) =>
  new ApiError(404, 'NOT_FOUND', resource + ' ' + id + ' not found');

export const badRequest = (message, details) =>
  new ApiError(400, 'BAD_REQUEST', message, details);

export const unauthorized = () =>
  new ApiError(401, 'UNAUTHORIZED', 'authentication required');

export function toResponse(error, { exposeStack = false } = {}) {
  const known = error instanceof ApiError;

  // Unknown errors are never echoed back: their messages leak internals.
  const body = {
    error: {
      code: known ? error.code : 'INTERNAL',
      message: known ? error.message : 'internal server error',
      ...(known && error.details ? { details: error.details } : {}),
      ...(exposeStack && error?.stack ? { stack: error.stack } : {}),
    },
  };

  return { status: known ? error.status : 500, body };
}

export function handler(fn, { logger = console.error } = {}) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      const { status, body } = toResponse(error);
      // The client gets a generic 500; the original goes to the logs, or the
      // bug is invisible to everyone.
      if (status >= 500) logger(error);
      if (res.writableEnded || res.headersSent) return;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    }
  };
}
