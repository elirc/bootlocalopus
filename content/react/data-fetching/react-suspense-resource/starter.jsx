import { Component, Suspense, useState, useTransition } from 'react';

export function createResourceCache(loader) {
  return {
    read(key) {
      // Bug: a new request on every render, and it never suspends.
      loader(key);
      return undefined;
    },
    preload(key) {
      // TODO
    },
    invalidate(key) {
      // TODO
    },
  };
}

function Profile({ resource, userId }) {
  const user = resource.read(userId);
  return <h2>{user?.name}</h2>;
}

export function ProfilePage({ resource, userId }) {
  // TODO: a Suspense fallback and an error boundary with "Try again"
  return <Profile resource={resource} userId={userId} />;
}

export function ProfileSwitcher({ resource, userIds }) {
  const [userId, setUserId] = useState(userIds[0]);
  return (
    <div>
      {userIds.map((id) => (
        <button key={id} onClick={() => setUserId(id)}>
          Show {id}
        </button>
      ))}
      <section aria-label="Profile">
        <ProfilePage resource={resource} userId={userId} />
      </section>
    </div>
  );
}
