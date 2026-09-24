import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function withContext(fields, fn) {
  // TODO: run fn inside an AsyncLocalStorage store, merged with the outer one.
  return fn();
}

export function createLogger({
  write = (line) => process.stdout.write(line + '\n'),
  level = 'info',
  now = Date.now,
  redact = ['password', 'authorization', 'cookie', 'token'],
} = {}) {
  // TODO: debug/info/warn/error(msg, fields) and child(bindings).
  throw new Error('createLogger() is not implemented yet');
}

export function requestLogging(handler, { logger, genId = () => crypto.randomUUID() }) {
  return (req, res) => {
    // TODO: request id, response header, context, completion and failure logs.
    // (This stub answers 501 so the tests fail fast instead of hanging.)
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  };
}
