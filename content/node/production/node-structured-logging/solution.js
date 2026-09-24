import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const RESERVED = new Set(['level', 'time', 'msg']);
const REDACTED = '[REDACTED]';

const context = new AsyncLocalStorage();

export function withContext(fields, fn) {
  // Merge with the enclosing context so nested scopes add to it, not replace it.
  return context.run({ ...context.getStore(), ...fields }, fn);
}

/**
 * A JSON-safe copy of `value` with redacted keys, serialisable Errors and
 * circular references cut. `ancestors` is the current path, so an object
 * shared between two branches is not mistaken for a cycle.
 */
function clean(value, redact, ancestors = new Set()) {
  if (typeof value === 'bigint') return String(value);
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) return '[Circular]';
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value.toJSON === 'function') return value; // Date and friends
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => clean(item, redact, ancestors));
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = redact.has(key.toLowerCase()) ? REDACTED : clean(v, redact, ancestors);
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

export function createLogger({
  write = (line) => process.stdout.write(line + '\n'),
  level = 'info',
  now = Date.now,
  redact = ['password', 'authorization', 'cookie', 'token'],
} = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const redactSet = new Set(redact.map((k) => k.toLowerCase()));

  const make = (bindings) => {
    const log = (lvl) => (msg, fields = {}) => {
      if (LEVELS[lvl] < threshold) return;
      const merged = { ...context.getStore(), ...bindings, ...fields };
      for (const key of RESERVED) delete merged[key];
      const record = {
        level: lvl,
        time: new Date(now()).toISOString(),
        msg: String(msg),
        ...clean(merged, redactSet),
      };
      write(JSON.stringify(record));
    };

    return {
      debug: log('debug'),
      info: log('info'),
      warn: log('warn'),
      error: log('error'),
      child: (more = {}) => make({ ...bindings, ...more }),
    };
  };

  return make({});
}

const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function requestLogging(handler, { logger, genId = () => crypto.randomUUID() }) {
  return async (req, res) => {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : genId();
    res.setHeader('x-request-id', requestId);

    const path = new URL(req.url, 'http://localhost').pathname;
    // 'finish' is emitted from socket internals, not from inside our context,
    // so re-enter it explicitly rather than hoping it propagates.
    res.on('finish', () => {
      withContext({ requestId }, () => {
        logger.info('request completed', { method: req.method, path, status: res.statusCode });
      });
    });

    await withContext({ requestId }, async () => {
      try {
        await handler(req, res);
      } catch (err) {
        logger.error('request failed', { err });
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'internal error' }));
        } else {
          res.destroy();
        }
      }
    });
  };
}
