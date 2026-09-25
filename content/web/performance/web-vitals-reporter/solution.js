const round = (name, value) => (name === 'CLS' ? Math.round(value * 10000) / 10000 : Math.round(value));

export function createVitalsReporter({ endpoint, sessionId, sampleRate = 1, random = Math.random, transport }) {
  // Decide once per page view: re-rolling per metric would keep partial data.
  const sampled = random() < sampleRate;
  const latest = new Map(); // id -> metric; Map keeps first-insertion order
  const pending = new Set(); // ids changed since the last flush

  function record({ name, value, id, rating }) {
    if (!sampled) return;
    const metric = { name, value: round(name, value), id, rating };
    const previous = latest.get(id);
    if (previous && previous.value === metric.value && previous.rating === metric.rating) return;
    latest.set(id, metric);
    pending.add(id);
  }

  function flush() {
    if (!sampled || pending.size === 0) return;
    const metrics = [...latest.keys()].filter((id) => pending.has(id)).map((id) => latest.get(id));
    pending.clear();

    const body = JSON.stringify({ sessionId, metrics });
    // sendBeacon survives the page being closed; keepalive fetch is the fallback.
    if (!transport.beacon(endpoint, body)) {
      transport.fetch(endpoint, {
        method: 'POST',
        body,
        keepalive: true,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  function attach(target) {
    const onVisibilityChange = () => {
      if (target.visibilityState === 'hidden') flush();
    };
    target.addEventListener('visibilitychange', onVisibilityChange);
    target.addEventListener('pagehide', flush);
    return () => {
      target.removeEventListener('visibilitychange', onVisibilityChange);
      target.removeEventListener('pagehide', flush);
    };
  }

  return { record, flush, attach };
}
