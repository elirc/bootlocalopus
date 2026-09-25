import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

const TRACEPARENT = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?$/;

export function parseTraceparent(header) {
  if (typeof header !== 'string') return null;
  const m = TRACEPARENT.exec(header);
  if (!m) return null;
  const [, version, traceId, parentId, flags, rest] = m;
  if (version === 'ff') return null;
  if (version === '00' && rest !== undefined) return null;
  if (/^0+$/.test(traceId) || /^0+$/.test(parentId)) return null;
  return { version, traceId, parentId, flags: parseInt(flags, 16) };
}

export function formatTraceparent({ traceId, spanId, sampled }) {
  return `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`;
}

const randomIds = {
  traceId: () => randomBytes(16).toString('hex'),
  spanId: () => randomBytes(8).toString('hex'),
};

export function createTracing({ ids = randomIds, sample = () => true } = {}) {
  // Per-request context survives awaits and never leaks between concurrent requests.
  const storage = new AsyncLocalStorage();

  function contextFor(req) {
    const incoming = parseTraceparent(req.headers['traceparent']);
    if (incoming) {
      return {
        traceId: incoming.traceId,
        parentSpanId: incoming.parentId,
        spanId: ids.spanId(),
        sampled: (incoming.flags & 1) === 1,
        tracestate: req.headers['tracestate'] ?? null,
      };
    }
    return { traceId: ids.traceId(), parentSpanId: null, spanId: ids.spanId(), sampled: Boolean(sample()), tracestate: null };
  }

  return {
    middleware(handler) {
      return (req, res) => {
        const ctx = contextFor(req);
        res.setHeader('x-trace-id', ctx.traceId);
        return storage.run(ctx, () => handler(req, res));
      };
    },

    current() {
      const ctx = storage.getStore();
      if (!ctx) return null;
      const { traceId, spanId, parentSpanId, sampled } = ctx;
      return { traceId, spanId, parentSpanId, sampled };
    },

    outgoingHeaders() {
      const ctx = storage.getStore();
      if (!ctx) return {};
      const headers = { traceparent: formatTraceparent(ctx) };
      if (ctx.tracestate) headers.tracestate = ctx.tracestate;
      return headers;
    },
  };
}
