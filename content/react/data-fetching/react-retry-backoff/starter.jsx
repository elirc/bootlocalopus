import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function defaultSleep(ms, signal) {
  // TODO: resolve after `ms` with setTimeout; reject with signal.reason
  // (and clear the timer) as soon as the signal aborts.
  return Promise.reject(new Error('defaultSleep is not implemented yet'));
}

export async function fetchWithRetry(
  request,
  { retries = 3, baseDelay = 500, sleep = defaultSleep, signal, onRetry } = {},
) {
  // Retries everything, immediately, and never stops early.
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await request({ signal });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function OrderStatus({ orderId, loadOrder, sleep }) {
  const [order, setOrder] = useState(null);
  useEffect(() => {
    fetchWithRetry(() => loadOrder(orderId), { sleep }).then(setOrder);
  }, [orderId]);
  // TODO: loading, retrying, error states, and abort on cleanup
  return <p>{order ? `Status: ${order.status}` : 'Loading…'}</p>;
}
