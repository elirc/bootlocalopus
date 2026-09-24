import { useState, useEffect } from 'react';

export function UserCard({ user, items }) {
  // BUG: a snapshot of the prop, taken once on mount
  const [fullName] = useState(user.first + ' ' + user.last);

  // BUG: state that mirrors a prop, one render behind
  const [itemCount, setItemCount] = useState(0);
  useEffect(() => {
    setItemCount(items.length);
  }, [items]);

  return (
    <div>
      <h2>{fullName}</h2>
      <p>{itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
      <span>{user.verified ? 'Verified' : 'Unverified'}</span>
    </div>
  );
}
