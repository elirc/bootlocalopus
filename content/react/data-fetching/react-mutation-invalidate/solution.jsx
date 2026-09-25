import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Call now, and turn a synchronous throw into a rejection.
function attempt(fn, ...args) {
  try {
    return Promise.resolve(fn(...args));
  } catch (error) {
    return Promise.reject(error);
  }
}

export function useLatestQuery(fetcher) {
  const fetcherRef = useRef(fetcher);
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [state, setState] = useState({ data: undefined, error: null, isFetching: true });
  const latestRequest = useRef(0);
  const mounted = useRef(false);

  const refetch = useCallback(() => {
    // Number every request; only the newest may write.
    const id = ++latestRequest.current;
    setState((s) => ({ ...s, isFetching: true }));
    const isLatest = () => mounted.current && id === latestRequest.current;
    attempt(fetcherRef.current).then(
      (data) => {
        if (isLatest()) setState({ data, error: null, isFetching: false });
      },
      (error) => {
        if (isLatest()) setState((s) => ({ ...s, error, isFetching: false }));
      },
    );
  }, []);

  useEffect(() => {
    mounted.current = true;
    refetch();
    return () => {
      mounted.current = false;
    };
  }, [refetch]);

  return { ...state, refetch };
}

const IDLE = { status: 'idle', data: undefined, error: null };

export function useMutation(mutationFn, options = {}) {
  const latest = useRef({ mutationFn, options });
  useLayoutEffect(() => {
    latest.current = { mutationFn, options };
  });

  const [state, setState] = useState(IDLE);
  const lastCall = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const mutate = useCallback((variables) => {
    const id = ++lastCall.current;
    const isCurrent = () => mounted.current && id === lastCall.current;
    setState({ status: 'pending', data: undefined, error: null });

    attempt(latest.current.mutationFn, variables)
      .then(
        (data) => {
          // Callbacks run even after unmount: invalidation must not be lost.
          latest.current.options.onSuccess?.(data, variables);
          if (isCurrent()) setState({ status: 'success', data, error: null });
        },
        (error) => {
          latest.current.options.onError?.(error, variables);
          if (isCurrent()) setState({ status: 'error', data: undefined, error });
        },
      )
      .catch(() => {}); // a throwing callback must not become an unhandled rejection
  }, []);

  const reset = useCallback(() => {
    lastCall.current++;
    setState(IDLE);
  }, []);

  return { ...state, mutate, reset };
}

export function TodoApp({ api }) {
  const todos = useLatestQuery(() => api.fetchTodos());
  const [title, setTitle] = useState('');
  const add = useMutation((t) => api.addTodo(t), {
    onSuccess: () => {
      setTitle('');
      todos.refetch();
    },
  });

  return (
    <div>
      <ul>
        {(todos.data ?? []).map((todo) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
      <button onClick={todos.refetch}>Refresh</button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (add.status !== 'pending') add.mutate(title);
        }}
      >
        <input aria-label="New todo" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" disabled={add.status === 'pending'}>
          Add
        </button>
      </form>
      {add.status === 'error' && <p role="alert">Could not add todo: {add.error.message}</p>}
    </div>
  );
}
