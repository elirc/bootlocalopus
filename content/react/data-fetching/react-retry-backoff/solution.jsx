import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const isRetryable = (error) =>
  error == null || error.status === undefined || error.status >= 500 || error.status === 429;

export async function fetchWithRetry(
  request,
  { retries = 3, baseDelay = 500, sleep = defaultSleep, signal, onRetry } = {},
) {
  for (let retry = 0; ; retry++) {
    if (signal?.aborted) throw signal.reason;
    try {
      return await request({ signal });
    } catch (error) {
      // An abort surfaces as a rejection too; it is never worth retrying.
      if (signal?.aborted) throw signal.reason;
      if (!isRetryable(error) || retry >= retries) throw error;

      const delay =
        error?.status === 429 && typeof error.retryAfter === 'number'
          ? error.retryAfter * 1000
          : baseDelay * 2 ** retry;
      onRetry?.({ attempt: retry + 2, delay, error });
      await sleep(delay, signal);
    }
  }
}

export function OrderStatus({ orderId, loadOrder, sleep }) {
  // Results are tagged with the order they belong to, so a new orderId
  // shows "Loading…" on its very first render, with no reset effect.
  const [result, setResult] = useState({ orderId, status: 'loading', attempt: 1 });
  const state = result.orderId === orderId ? result : { status: 'loading', attempt: 1 };

  const latest = useRef({ loadOrder, sleep });
  useLayoutEffect(() => {
    latest.current = { loadOrder, sleep };
  });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    fetchWithRetry(({ signal: s }) => latest.current.loadOrder(orderId, s), {
      sleep: latest.current.sleep,
      signal,
      onRetry: ({ attempt }) => {
        if (!signal.aborted) setResult({ orderId, status: 'loading', attempt });
      },
    }).then(
      (order) => {
        if (!signal.aborted) setResult({ orderId, status: 'success', order });
      },
      () => {
        if (!signal.aborted) setResult({ orderId, status: 'error' });
      },
    );

    return () => controller.abort();
  }, [orderId]);

  if (state.status === 'success') return <p>Status: {state.order.status}</p>;
  if (state.status === 'error') return <p role="alert">Could not load order</p>;
  if (state.attempt > 1) return <p>Retrying (attempt {state.attempt} of 4)…</p>;
  return <p>Loading…</p>;
}
