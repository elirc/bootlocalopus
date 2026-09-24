import { useState, useEffect, useRef } from 'react';

export function UserProfile({ userId, load }) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // Callers usually pass an inline `load={(id, s) => fetch(...)}`, which is a
  // new function on every parent render. Putting it in the dependency array
  // would refetch on every render (and loop, since the effect sets state).
  // Keep the latest one in a ref and depend only on what should refetch.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ status: 'loading' });

    loadRef.current(userId, controller.signal).then(
      (user) => {
        // `active` is false if this effect has already been cleaned up, which
        // is what stops a slow first response overwriting a fast second one.
        if (active) setState({ status: 'success', user });
      },
      () => {
        if (active) setState({ status: 'error' });
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, [userId, attempt]);

  if (state.status === 'loading') return <p>Loading…</p>;
  if (state.status === 'error') {
    return (
      <div>
        <p>Something went wrong</p>
        <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
      </div>
    );
  }
  return <h2>{state.user.name}</h2>;
}
