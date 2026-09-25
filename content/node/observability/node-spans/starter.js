import { randomBytes } from 'node:crypto';

export function createTracer({ exporter, now = () => performance.now(), ids }) {
  let current = null;

  // TODO: parents from AsyncLocalStorage, attributes and events, error
  // status with an exception event, export exactly once, ignore exporter
  // failures. A module-level `current` gets concurrent siblings wrong.
  return {
    async startActiveSpan(name, fn) {
      const span = { traceId: current?.traceId ?? randomBytes(16).toString('hex'), spanId: randomBytes(8).toString('hex') };
      const parent = current;
      current = span;
      const startTime = now();
      const result = await fn({ ...span, setAttribute() {}, addEvent() {} });
      current = parent;
      exporter.export({ name, ...span, parentSpanId: parent?.spanId ?? null, startTime, endTime: now(), status: 'ok' });
      return result;
    },
    activeSpan() {
      return current;
    },
  };
}
