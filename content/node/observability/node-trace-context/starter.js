import { randomBytes } from 'node:crypto';

export function parseTraceparent(header) {
  // TODO: validate every rule in the brief. This accepts anything with four parts.
  const [version, traceId, parentId, flags] = String(header).split('-');
  if (!flags) return null;
  return { version, traceId, parentId, flags: parseInt(flags, 16) };
}

export function formatTraceparent({ traceId, spanId, sampled }) {
  return `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`;
}

export function createTracing({ ids, sample = () => true } = {}) {
  // TODO: continue valid incoming traces, keep the context in AsyncLocalStorage,
  // forward tracestate, set x-trace-id.
  // A module-level "current" is overwritten by every concurrent request.
  let current = null;
  return {
    middleware(handler) {
      return (req, res) => {
        current = { traceId: randomBytes(16).toString('hex'), spanId: randomBytes(8).toString('hex'), parentSpanId: null, sampled: true };
        return handler(req, res);
      };
    },
    current() {
      return current;
    },
    outgoingHeaders() {
      return current ? { traceparent: formatTraceparent(current) } : {};
    },
  };
}
