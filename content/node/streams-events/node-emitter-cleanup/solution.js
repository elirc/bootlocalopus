export function watchJob(emitter, jobId, { signal } = {}) {
  const queue = []; // { value } | { end: true } | { error }
  let wake = null;
  let finished = false;

  const push = (item) => {
    queue.push(item);
    if (wake) {
      wake();
      wake = null;
    }
  };
  const onProgress = (e) => { if (e.jobId === jobId) push({ value: e.percent }); };
  const onDone = (e) => { if (e.jobId === jobId) push({ end: true }); };
  const onFailed = (e) => { if (e.jobId === jobId) push({ error: e.error }); };
  const onAbort = () => push({ error: signal.reason });

  // Subscribe now, not on the first next(): events emitted before iteration starts still count.
  emitter.on('progress', onProgress);
  emitter.on('done', onDone);
  emitter.on('failed', onFailed);
  if (signal) {
    if (signal.aborted) push({ error: signal.reason });
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  // Idempotent, and reachable from every exit.
  const finish = () => {
    if (finished) return;
    finished = true;
    emitter.off('progress', onProgress);
    emitter.off('done', onDone);
    emitter.off('failed', onFailed);
    signal?.removeEventListener('abort', onAbort);
    queue.length = 0;
    if (wake) {
      wake();
      wake = null;
    }
  };

  // A hand-written iterator rather than an async generator: a generator's
  // return() before its first next() never runs its finally block.
  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      while (queue.length === 0 && !finished) {
        await new Promise((resolve) => { wake = resolve; });
      }
      if (finished) return { value: undefined, done: true };
      const item = queue.shift();
      if (item.end) {
        finish();
        return { value: undefined, done: true };
      }
      if ('error' in item) {
        finish();
        throw item.error;
      }
      return { value: item.value, done: false };
    },
    async return() {
      finish();
      return { value: undefined, done: true };
    },
  };
}
