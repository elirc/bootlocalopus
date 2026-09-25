export function createReporter({
  transport,
  now = Date.now,
  windowMs = 60_000,
  maxPerWindow = 5,
  release = null,
  scrubKeys = ['password', 'token', 'authorization', 'cookie', 'secret'],
}) {
  // TODO: normalise non-Errors, fingerprint with ids stripped, rate-limit per
  // fingerprint, count suppressed events, scrub secrets, swallow transport failures.
  return {
    capture(error, context = {}) {
      transport({ fingerprint: error.message, name: error.name, message: error.message, stack: error.stack, release, context });
      return true;
    },
  };
}

export function wrapHandler(handler, reporter) {
  // TODO: report only server errors; answer client errors with their status.
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      reporter.capture(error, { url: req.url });
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'INTERNAL', message: error.message } }));
    }
  };
}
