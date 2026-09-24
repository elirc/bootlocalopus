import { useState, useEffect, useCallback, useRef } from 'react';

export function List({ items, children, empty }) {
  if (items.length === 0) return empty ?? <p>Nothing here</p>;
  return (
    <ul>
      {items.map((item, index) => (
        <li key={item?.id ?? index}>{children(item, index)}</li>
      ))}
    </ul>
  );
}

export function Toggle({ children, initial = false }) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((current) => !current), []);
  return children({ on, toggle });
}

export function Resource({ load, children }) {
  const [state, setState] = useState({ status: 'loading', data: undefined, error: undefined });

  // `load` is usually an inline arrow, new on every parent render. As an
  // effect dependency it would reload on every render (and loop, because the
  // effect sets state). Load once on mount, through a ref.
  const loadRef = useRef(load);

  useEffect(() => {
    let active = true;
    loadRef.current().then(
      (data) => { if (active) setState({ status: 'success', data, error: undefined }); },
      (error) => { if (active) setState({ status: 'error', data: undefined, error }); },
    );
    return () => { active = false; };
  }, []);

  return children(state);
}
