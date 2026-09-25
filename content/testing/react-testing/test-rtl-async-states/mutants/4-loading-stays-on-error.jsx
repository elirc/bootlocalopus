import { useRef, useState } from 'react';

/** `search(query)` resolves to [{ id, name }] or rejects. */
export function UserSearch({ search }) {
  const [text, setText] = useState('');
  // idle | loading | done | error
  const [state, setState] = useState({ status: 'idle', query: '', users: [] });
  const latest = useRef(0);

  const run = async (query) => {
    const requestId = ++latest.current;
    setState({ status: 'loading', query, users: [] });
    try {
      const users = await search(query);
      // A slower, older request must not overwrite a newer one.
      if (requestId === latest.current) setState({ status: 'done', query, users });
    } catch {
      if (requestId === latest.current) setState({ status: 'error', query, users: [] });
    }
  };

  const submit = (event) => {
    event.preventDefault();
    const query = text.trim();
    if (query) run(query);
  };

  return (
    <div>
      <form onSubmit={submit} role="search">
        <label htmlFor="user-search">Search users</label>
        <input id="user-search" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Search</button>
      </form>

      {(state.status === 'loading' || state.status === 'error') && <p role="status">Loading…</p>}
      {state.status === 'error' && (
        <div role="alert">
          Something went wrong.
          <button type="button" onClick={() => run(state.query)}>Retry</button>
        </div>
      )}
      {state.status === 'done' && state.users.length === 0 && <p>No users match "{state.query}"</p>}
      {state.status === 'done' && state.users.length > 0 && (
        <ul aria-label="Results">
          {state.users.map((u) => <li key={u.id}>{u.name}</li>)}
        </ul>
      )}
    </div>
  );
}
