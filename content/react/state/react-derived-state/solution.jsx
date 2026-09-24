export function UserCard({ user, items }) {
  // Derived during render: it cannot go stale, and there is no extra render.
  const fullName = user.first + ' ' + user.last;
  const itemCount = items.length;

  return (
    <div>
      <h2>{fullName}</h2>
      <p>{itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
      <span>{user.verified ? 'Verified' : 'Unverified'}</span>
    </div>
  );
}
