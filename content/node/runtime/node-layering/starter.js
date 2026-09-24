import http from 'node:http';

export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}
export class ConflictError extends Error {
  constructor(message) { super(message); this.name = 'ConflictError'; }
}
export class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}

export function createMemoryUserRepo() {
  // TODO: a Map, a counter, and the five methods
}

export function createUserService({ users, now = () => new Date('2024-01-01') }) {
  // TODO: the rules live here, and only here
}

export function createUserHandler(service) {
  return async (req, res) => {
    // TODO: HTTP only.
    // (This stub answers 501 so the tests fail fast instead of hanging.)
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  };
}
