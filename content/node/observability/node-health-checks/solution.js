function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function createHealth({
  checks,
  timeoutMs = 1000,
  cacheMs = 1000,
  now = Date.now,
  timers = { setTimeout, clearTimeout },
}) {
  let draining = false;
  let inflight = null;           // the evaluation running now, shared by concurrent probes
  let cached = null;             // { result, finishedAt }

  /** One check with its own timeout and abort signal. Never rejects. */
  function runCheck({ check }) {
    const controller = new AbortController();
    return new Promise((resolve) => {
      let settled = false;
      const finish = (outcome) => {
        if (settled) return;
        settled = true;
        timers.clearTimeout(timer);
        resolve(outcome);
      };
      const timer = timers.setTimeout(() => {
        finish({ status: 'fail', error: 'timeout' });
        controller.abort(new Error('timeout'));
      }, timeoutMs);
      new Promise((r) => r(check(controller.signal))).then(
        () => finish({ status: 'ok' }),
        (error) => finish({ status: 'fail', error: error instanceof Error ? error.message : String(error) }),
      );
    });
  }

  async function evaluate() {
    const outcomes = await Promise.all(checks.map(runCheck));
    const result = { status: 'ok', checks: {} };
    checks.forEach((c, i) => {
      result.checks[c.name] = outcomes[i];
      if (outcomes[i].status === 'fail') {
        if (c.critical ?? true) result.status = 'fail';
        else if (result.status === 'ok') result.status = 'degraded';
      }
    });
    return result;
  }

  function readiness() {
    if (cached && now() - cached.finishedAt < cacheMs) return Promise.resolve(cached.result);
    if (!inflight) {
      inflight = evaluate().then((result) => {
        cached = { result, finishedAt: now() };
        inflight = null;
        return result;
      });
    }
    return inflight;
  }

  return {
    setDraining(value) {
      draining = Boolean(value);
    },

    async handler(req, res) {
      const { pathname } = new URL(req.url, 'http://x');
      if (req.method === 'GET' && pathname === '/livez') return send(res, 200, { status: 'ok' });
      if (req.method === 'GET' && pathname === '/readyz') {
        if (draining) return send(res, 503, { status: 'draining' });
        const result = await readiness();
        return send(res, result.status === 'fail' ? 503 : 200, result);
      }
      send(res, 404, { error: { code: 'NOT_FOUND' } });
    },
  };
}
