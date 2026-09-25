import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

const randomIds = {
  traceId: () => randomBytes(16).toString('hex'),
  spanId: () => randomBytes(8).toString('hex'),
};

export function createTracer({ exporter, now = () => performance.now(), ids = randomIds }) {
  // The active span follows the async call chain, so concurrent siblings
  // each see their real parent.
  const active = new AsyncLocalStorage();

  async function startActiveSpan(name, fn, { attributes = {} } = {}) {
    const parent = active.getStore();
    const traceId = parent ? parent.traceId : ids.traceId();
    const spanId = ids.spanId();
    const record = {
      name,
      traceId,
      spanId,
      parentSpanId: parent ? parent.spanId : null,
      startTime: now(),
      endTime: null,
      durationMs: null,
      status: null,
      attributes: { ...attributes },
      events: [],
    };
    let ended = false;

    const span = {
      traceId,
      spanId,
      setAttribute(key, value) {
        if (!ended) record.attributes[key] = value;
      },
      addEvent(eventName, eventAttributes = {}) {
        if (!ended) record.events.push({ name: eventName, time: now(), attributes: { ...eventAttributes } });
      },
    };

    const end = (status) => {
      ended = true;
      record.endTime = now();
      record.durationMs = record.endTime - record.startTime;
      record.status = status;
      try {
        exporter.export(record);
      } catch {
        // Telemetry must never break the request.
      }
    };

    try {
      const result = await active.run({ traceId, spanId }, () => fn(span));
      end('ok');
      return result;
    } catch (error) {
      span.addEvent('exception', { 'exception.type': error?.name, 'exception.message': error?.message });
      end('error');
      throw error;
    }
  }

  return {
    startActiveSpan,
    activeSpan() {
      const s = active.getStore();
      return s ? { traceId: s.traceId, spanId: s.spanId } : null;
    },
  };
}
