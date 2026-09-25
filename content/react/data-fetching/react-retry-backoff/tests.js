const { fetchWithRetry, defaultSleep, OrderStatus } = solution;

const httpError = (status, extra = {}) => Object.assign(new Error('HTTP ' + status), { status }, extra);
const networkError = () => new TypeError('Failed to fetch');

// Resolves at once and records every wait.
function instantSleep() {
  const waits = [];
  const sleep = (ms, signal) => { waits.push({ ms, signal }); return Promise.resolve(); };
  sleep.waits = waits;
  sleep.ms = () => waits.map((w) => w.ms);
  return sleep;
}
// Each outcome in turn: an Error rejects, anything else resolves.
function scripted(...outcomes) {
  const calls = [];
  const request = (arg) => {
    calls.push(arg);
    const next = outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  request.calls = calls;
  return request;
}
const caught = async (promise) => { try { await promise; } catch (e) { return e; } throw new Error('expected a rejection'); };

describe('fetchWithRetry', () => {
  it('returns the first success without waiting', async () => {
    const sleep = instantSleep();
    const request = scripted('ok');
    expect(await fetchWithRetry(request, { sleep })).toBe('ok');
    expect(request.calls).toHaveLength(1);
    expect(sleep.waits).toHaveLength(0);
  });

  it('retries network errors and 5xx with exponential backoff', async () => {
    const sleep = instantSleep();
    const request = scripted(networkError(), httpError(503), httpError(500), 'ok');
    expect(await fetchWithRetry(request, { sleep })).toBe('ok');
    expect(request.calls).toHaveLength(4);
    expect(sleep.ms()).toEqual([500, 1000, 2000]);
  });

  it('respects retries and baseDelay, then throws the last error', async () => {
    const sleep = instantSleep();
    const last = httpError(502);
    const request = scripted(httpError(500), httpError(503), last);
    const error = await caught(fetchWithRetry(request, { retries: 2, baseDelay: 100, sleep }));
    expect(error).toBe(last);
    expect(request.calls).toHaveLength(3);
    expect(sleep.ms()).toEqual([100, 200]);
  });

  it('does not retry client errors', async () => {
    for (const status of [400, 401, 404, 422]) {
      const sleep = instantSleep();
      const original = httpError(status);
      const request = scripted(original, 'never');
      const error = await caught(fetchWithRetry(request, { sleep }));
      expect(error).toBe(original);
      expect(request.calls).toHaveLength(1);
      expect(sleep.waits).toHaveLength(0);
    }
  });

  it('retries 429 and honours retryAfter', async () => {
    const sleep = instantSleep();
    const request = scripted(httpError(429, { retryAfter: 7 }), httpError(429), 'ok');
    expect(await fetchWithRetry(request, { sleep })).toBe('ok');
    expect(sleep.ms()).toEqual([7000, 1000]);
  });

  it('passes the signal to request and sleep', async () => {
    const sleep = instantSleep();
    const controller = new AbortController();
    const request = scripted(httpError(500), 'ok');
    await fetchWithRetry(request, { sleep, signal: controller.signal });
    expect(request.calls[0]).toEqual({ signal: controller.signal });
    expect(sleep.waits[0].signal).toBe(controller.signal);
  });

  it('reports each retry before waiting', async () => {
    const sleep = instantSleep();
    const seen = [];
    const e1 = networkError();
    const e2 = httpError(503);
    await fetchWithRetry(scripted(e1, e2, 'ok'), { sleep, onRetry: (info) => seen.push(info) });
    expect(seen).toEqual([
      { attempt: 2, delay: 500, error: e1 },
      { attempt: 3, delay: 1000, error: e2 },
    ]);
  });

  it('stops when aborted during a wait', async () => {
    const controller = new AbortController();
    const request = scripted(httpError(503), 'ok');
    const sleep = (ms, signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
    const pending = fetchWithRetry(request, { sleep, signal: controller.signal });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    const error = await caught(pending);
    expect(error).toBe(controller.signal.reason);
    expect(error.name).toBe('AbortError');
    expect(request.calls).toHaveLength(1);
  });

  it('does not call request at all when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const request = scripted('ok');
    const error = await caught(fetchWithRetry(request, { sleep: instantSleep(), signal: controller.signal }));
    expect(error).toBe(controller.signal.reason);
    expect(request.calls).toHaveLength(0);
  });

  it('does not retry when the request rejects because of the abort', async () => {
    const controller = new AbortController();
    const sleep = instantSleep();
    let calls = 0;
    const request = ({ signal }) => { calls++; controller.abort(); return Promise.reject(signal.reason); };
    const error = await caught(fetchWithRetry(request, { sleep, signal: controller.signal }));
    expect(error.name).toBe('AbortError');
    expect(calls).toBe(1);
    expect(sleep.waits).toHaveLength(0);
  });
});

describe('defaultSleep', () => {
  it('rejects with the abort reason as soon as the signal aborts', async () => {
    const controller = new AbortController();
    const pending = defaultSleep(60_000, controller.signal);
    controller.abort();
    const error = await caught(pending);
    expect(error).toBe(controller.signal.reason);
  });

  it('resolves after the delay', async () => {
    await defaultSleep(1);
  });
});

describe('OrderStatus', () => {
  // A sleep the test releases by hand.
  function manualSleep() {
    const waits = [];
    const sleep = (ms, signal) => new Promise((resolve, reject) => {
      waits.push({ ms, resolve });
      signal?.addEventListener('abort', () => reject(signal.reason));
    });
    sleep.waits = waits;
    return sleep;
  }
  function loader() {
    const calls = [];
    const loadOrder = (id, signal) => {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      calls.push({ id, signal, resolve, reject });
      return promise;
    };
    loadOrder.calls = calls;
    loadOrder.last = () => calls[calls.length - 1];
    return loadOrder;
  }
  const text = () => screen.getByRole('paragraph').textContent;
  const settle = async (fn) => { await act(async () => { fn(); }); };

  it('shows loading, retries, then the status', async () => {
    const sleep = manualSleep();
    const loadOrder = loader();
    render(<OrderStatus orderId="o1" loadOrder={loadOrder} sleep={sleep} />);
    expect(text()).toBe('Loading…');
    expect(loadOrder.calls[0].id).toBe('o1');
    await settle(() => loadOrder.calls[0].reject(httpError(503)));
    expect(text()).toBe('Retrying (attempt 2 of 4)…');
    await settle(() => sleep.waits[0].resolve());
    await settle(() => loadOrder.last().resolve({ status: 'shipped' }));
    expect(text()).toBe('Status: shipped');
  });

  it('shows the error once retries are exhausted, or at once for a 404', async () => {
    const loadOrder = loader();
    render(<OrderStatus orderId="o1" loadOrder={loadOrder} sleep={manualSleep()} />);
    await settle(() => loadOrder.calls[0].reject(httpError(404)));
    expect(screen.getByRole('alert').textContent).toBe('Could not load order');
    expect(loadOrder.calls).toHaveLength(1);
  });

  it('aborts on unmount: no more attempts', async () => {
    const sleep = manualSleep();
    const loadOrder = loader();
    const { unmount } = render(<OrderStatus orderId="o1" loadOrder={loadOrder} sleep={sleep} />);
    await settle(() => loadOrder.calls[0].reject(httpError(503)));
    unmount();
    expect(loadOrder.calls[0].signal.aborted).toBe(true);
    await settle(() => sleep.waits[0].resolve());
    expect(loadOrder.calls).toHaveLength(1);
  });

  it('switches orders without showing the old one\'s result', async () => {
    const sleep = manualSleep();
    const loadOrder = loader();
    const { rerender } = render(<OrderStatus orderId="o1" loadOrder={loadOrder} sleep={sleep} />);
    rerender(<OrderStatus orderId="o2" loadOrder={loadOrder} sleep={sleep} />);
    expect(loadOrder.calls[0].signal.aborted).toBe(true);
    expect(loadOrder.last().id).toBe('o2');
    await settle(() => loadOrder.calls[0].resolve({ status: 'OLD' }));
    expect(text()).toBe('Loading…');
    await settle(() => loadOrder.last().resolve({ status: 'delivered' }));
    expect(text()).toBe('Status: delivered');
  });
});
