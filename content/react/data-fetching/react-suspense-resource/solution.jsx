import { Component, Suspense, useState, useTransition } from 'react';

export function createResourceCache(loader) {
  const entries = new Map();

  function load(key) {
    let entry = entries.get(key);
    if (entry) return entry;

    let request;
    try {
      request = Promise.resolve(loader(key));
    } catch (error) {
      request = Promise.reject(error);
    }
    entry = { status: 'pending', value: undefined, error: undefined, promise: null };
    // The promise React waits on always resolves; the outcome is recorded
    // on the entry and read synchronously by the next render.
    entry.promise = request.then(
      (value) => {
        entry.status = 'success';
        entry.value = value;
      },
      (error) => {
        entry.status = 'error';
        entry.error = error;
      },
    );
    entries.set(key, entry);
    return entry;
  }

  return {
    read(key) {
      const entry = load(key);
      if (entry.status === 'success') return entry.value;
      if (entry.status === 'error') throw entry.error;
      throw entry.promise; // suspend until it settles
    },
    preload(key) {
      load(key);
    },
    invalidate(key) {
      entries.delete(key);
    },
  };
}

class ErrorBoundary extends Component {
  state = { error: null, failed: false };

  static getDerivedStateFromError(error) {
    return { error, failed: true };
  }

  componentDidUpdate(prevProps) {
    // A different user gets a fresh boundary, not the previous user's error.
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, failed: false });
    }
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null, failed: false });
  };

  render() {
    if (this.state.failed) return this.props.fallback(this.reset);
    return this.props.children;
  }
}

function Profile({ resource, userId }) {
  // Reading is the whole data-fetching story: no effect, no loading state.
  const user = resource.read(userId);
  return <h2>{user.name}</h2>;
}

export function ProfilePage({ resource, userId }) {
  return (
    // No `key={userId}` here: remounting the Suspense boundary would show
    // the fallback even inside a transition.
    <ErrorBoundary
      resetKey={userId}
      onReset={() => resource.invalidate(userId)}
      fallback={(retry) => (
        <div>
          <p role="alert">Could not load profile</p>
          <button onClick={retry}>Try again</button>
        </div>
      )}
    >
      <Suspense fallback={<p>Loading profile…</p>}>
        <Profile resource={resource} userId={userId} />
      </Suspense>
    </ErrorBoundary>
  );
}

export function ProfileSwitcher({ resource, userIds }) {
  const [userId, setUserId] = useState(userIds[0]);
  const [isPending, startTransition] = useTransition();

  return (
    <div>
      {userIds.map((id) => (
        <button key={id} onClick={() => startTransition(() => setUserId(id))}>
          Show {id}
        </button>
      ))}
      <section aria-label="Profile" aria-busy={isPending}>
        <ProfilePage resource={resource} userId={userId} />
      </section>
    </div>
  );
}
