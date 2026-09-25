// A first attempt: one fetch per metric update, sent straight away.
export function createVitalsReporter({ endpoint, sessionId, sampleRate = 1, random = Math.random, transport }) {
  return {
    record(metric) {
      transport.fetch(endpoint, { method: 'POST', body: JSON.stringify({ sessionId, metrics: [metric] }) });
    },
    flush() {},
    attach(target) {
      return () => {};
    },
  };
}
