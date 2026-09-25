import { useEffect, useRef, useState } from 'react';

export function useInterval(callback, delay) {
  useEffect(() => {
    // Bug: this runs the first render's callback forever and ignores `delay`.
    const id = setInterval(callback, 1000);
    return () => clearInterval(id);
  }, []);
}

export function Countdown({ from, onDone }) {
  const [remaining, setRemaining] = useState(from);
  // TODO: tick down, pause/resume, stop at 0 and call onDone once
  return <p role="timer">{remaining}</p>;
}
