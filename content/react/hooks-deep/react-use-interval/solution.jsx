import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useInterval(callback, delay) {
  // The interval reads the callback through a ref, so a new callback
  // identity never needs to restart it.
  const savedCallback = useRef(callback);
  useLayoutEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    if (delay === null) return undefined;
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

export function Countdown({ from, onDone }) {
  const [remaining, setRemaining] = useState(from);
  const [paused, setPaused] = useState(false);

  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  });

  const finished = remaining === 0;
  useInterval(() => setRemaining((r) => Math.max(0, r - 1)), paused || finished ? null : 1000);

  // Side effects belong in an effect, not in the state updater (which React
  // may call twice). This runs once, on the commit where remaining hits 0.
  useEffect(() => {
    if (finished) onDoneRef.current?.();
  }, [finished]);

  return (
    <div>
      <p role="timer">{remaining}</p>
      <button onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
    </div>
  );
}
