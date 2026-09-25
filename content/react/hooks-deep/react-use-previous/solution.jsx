import { useRef, useState, useEffect, useLayoutEffect } from 'react';

export function usePrevious(value) {
  const ref = useRef(undefined);
  // Written after commit, so a render React throws away (or repeats, as
  // StrictMode does) cannot corrupt it.
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

export function useLatest(value) {
  const ref = useRef(value);
  // Layout effects run before passive effects, so any useEffect that reads
  // ref.current already sees this commit's value.
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export function PriceTicker({ price }) {
  // "Storing information from previous renders": compare against the last
  // price we *saw change*, and update state during render when it differs.
  // React re-runs the component immediately, before touching the DOM.
  const [lastPrice, setLastPrice] = useState(price);
  const [trend, setTrend] = useState('');

  if (price !== lastPrice) {
    setLastPrice(price);
    setTrend(price > lastPrice ? 'up' : 'down');
  }

  return (
    <div>
      <span data-testid="price">{price}</span>
      <span data-testid="trend">{trend}</span>
    </div>
  );
}
