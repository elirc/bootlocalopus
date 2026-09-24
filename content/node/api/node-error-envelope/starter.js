export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    // TODO
  }
}

export const notFound = (resource, id) => null;   // TODO
export const badRequest = (message, details) => null;  // TODO
export const unauthorized = () => null;  // TODO

export function toResponse(error, { exposeStack = false } = {}) {
  // TODO
}

export function handler(fn, { logger = console.error } = {}) {
  // TODO: run fn, and turn anything it throws into the right JSON response.
  // (This stub answers 501 so the tests fail fast instead of hanging.)
  return async (req, res) => {
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  };
}
