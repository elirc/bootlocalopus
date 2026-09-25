import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function LiveTotals({ feed, limit, onOverLimit }) {
  // Total and count always change together: one state object, one updater.
  const [totals, setTotals] = useState({ total: 0, count: 0 });
  const { total, count } = totals;

  // Updater functions receive the latest state, so a callback created on the
  // first render is still correct on the hundredth payment.
  const addPayment = (amount) =>
    setTotals((t) => ({ total: t.total + amount, count: t.count + 1 }));

  useEffect(() => {
    return feed.subscribe(({ amount }) => addPayment(amount));
  }, [feed]);

  // Derived during render from the current props: never stale.
  const over = total > limit;

  // The latest callback, without resubscribing or re-running effects.
  const onOverLimitRef = useRef(onOverLimit);
  useLayoutEffect(() => {
    onOverLimitRef.current = onOverLimit;
  });

  // Fires when `over` flips to true, not on every payment while over.
  useEffect(() => {
    if (over) onOverLimitRef.current?.(total);
    // `total` is read at the moment of crossing; it is not a trigger.
  }, [over]);

  const addTestPayments = () => {
    for (let i = 0; i < 3; i++) addPayment(1);
  };

  return (
    <div>
      <p data-testid="total">Total: {total}</p>
      <p data-testid="count">Count: {count}</p>
      {over && <p role="alert">Over limit</p>}
      <button onClick={addTestPayments}>Add 3 test payments</button>
    </div>
  );
}
