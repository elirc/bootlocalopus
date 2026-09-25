import { useEffect, useRef, useState } from 'react';

export function LiveTotals({ feed, limit, onOverLimit }) {
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    return feed.subscribe(({ amount }) => {
      setTotal(total + amount);
      setCount(count + 1);
      if (total + amount > limit) onOverLimit(total + amount);
    });
  }, []);

  const addTestPayments = () => {
    for (let i = 0; i < 3; i++) {
      setTotal(total + 1);
      setCount(count + 1);
    }
  };

  return (
    <div>
      <p data-testid="total">Total: {total}</p>
      <p data-testid="count">Count: {count}</p>
      {total > limit && <p role="alert">Over limit</p>}
      <button onClick={addTestPayments}>Add 3 test payments</button>
    </div>
  );
}
