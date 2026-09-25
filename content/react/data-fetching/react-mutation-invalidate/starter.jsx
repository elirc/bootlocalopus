import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useLatestQuery(fetcher) {
  const [state, setState] = useState({ data: undefined, error: null, isFetching: true });

  // Every response is applied as it arrives, so a slow old one can win.
  const refetch = () => {
    setState((s) => ({ ...s, isFetching: true }));
    fetcher().then(
      (data) => setState({ data, error: null, isFetching: false }),
      (error) => setState((s) => ({ ...s, error, isFetching: false })),
    );
  };

  useEffect(() => {
    refetch();
  }, []);

  return { ...state, refetch };
}

export function useMutation(mutationFn, options = {}) {
  const [state, setState] = useState({ status: 'idle', data: undefined, error: null });

  const mutate = (variables) => {
    // TODO: pending/success/error, callbacks, latest call wins
    throw new Error('mutate is not implemented yet');
  };
  const reset = () => setState({ status: 'idle', data: undefined, error: null });

  return { ...state, mutate, reset };
}

export function TodoApp({ api }) {
  const todos = useLatestQuery(() => api.fetchTodos());
  const [title, setTitle] = useState('');
  const add = useMutation((t) => api.addTodo(t));

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
          add.mutate(title);
        }}
      >
        <input aria-label="New todo" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}
