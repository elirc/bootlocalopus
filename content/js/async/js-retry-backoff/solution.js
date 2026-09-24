// An abortable wait: a user who navigates away should not sit out a 30 s backoff.
const defaultSleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

export async function retry(fn, options = {}) {
  const {
    attempts = 3,
    baseDelay = 10,
    factor = 2,
    jitter = (ms) => ms,
    shouldRetry = () => true,
    sleep = defaultSleep,
    signal,
  } = options;

  const abortError = () => signal?.reason ?? new Error('aborted');
  if (signal?.aborted) throw abortError();

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const isLast = attempt === attempts;
      if (isLast || !shouldRetry(err, attempt)) throw err;
      await sleep(jitter(baseDelay * factor ** (attempt - 1)), signal);
      // An injected sleep may not honour the signal, so check again.
      if (signal?.aborted) throw abortError();
    }
  }
  throw lastError;
}
