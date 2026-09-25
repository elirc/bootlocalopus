const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const isPlainObject = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

export function createReporter({
  transport,
  now = Date.now,
  windowMs = 60_000,
  maxPerWindow = 5,
  release = null,
  scrubKeys = ['password', 'token', 'authorization', 'cookie', 'secret'],
}) {
  const needles = scrubKeys.map((k) => k.toLowerCase());
  const windows = new Map(); // fingerprint -> { start, sent, suppressed }

  function scrub(value) {
    if (Array.isArray(value)) return value.map(scrub);
    if (!isPlainObject(value)) return value;
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      const lower = key.toLowerCase();
      out[key] = needles.some((n) => lower.includes(n)) ? '[scrubbed]' : scrub(v);
    }
    return out;
  }

  function normalise(error) {
    if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack ?? null };
    return { name: 'NonError', message: String(error), stack: null };
  }

  function capture(error, context = {}) {
    try {
      const { name, message, stack } = normalise(error);
      const fingerprint = `${name}: ${message.replace(UUID, '<uuid>').replace(/\d+/g, '<n>')}`;

      const t = now();
      let w = windows.get(fingerprint);
      if (!w || t - w.start >= windowMs) {
        w = { start: t, sent: 0, suppressed: w ? w.suppressed : 0 };
        windows.set(fingerprint, w);
      }
      if (w.sent >= maxPerWindow) {
        w.suppressed++;
        return false;
      }
      w.sent++;
      const event = {
        fingerprint, name, message, stack, release,
        timestamp: new Date(t).toISOString(),
        suppressed: w.suppressed,
        context: scrub(context),
      };
      w.suppressed = 0;

      // The reporter must never become the outage: swallow sync and async failures.
      try {
        const sent = transport(event);
        if (sent && typeof sent.then === 'function') sent.then(undefined, () => {});
      } catch {
        // ignored on purpose
      }
      return true;
    } catch {
      return false;
    }
  }

  return { capture };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function wrapHandler(handler, reporter) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const status = error?.status;
      const clientError = Number.isInteger(status) && status >= 400 && status <= 499;
      if (!clientError) {
        reporter.capture(error, {
          method: req.method,
          path: new URL(req.url, 'http://x').pathname,
          requestId: req.headers['x-request-id'] ?? null,
        });
      }
      if (res.headersSent) return res.destroy();
      if (clientError) return sendJson(res, status, { error: { code: error.code ?? 'BAD_REQUEST', message: error.message } });
      sendJson(res, 500, { error: { code: 'INTERNAL', message: 'internal error' } });
    }
  };
}
