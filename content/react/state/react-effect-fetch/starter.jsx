import { useState, useEffect } from 'react';

export function UserProfile({ userId, load }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    // TODO: fetch, and clean up so a stale response cannot win
  }, [userId]);

  // TODO: render by status
  return null;
}
