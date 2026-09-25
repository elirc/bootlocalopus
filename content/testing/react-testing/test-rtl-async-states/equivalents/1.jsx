// Same behaviour: a reducer, a per-request "superseded" flag instead of a counter, different markup.
import { useReducer, useRef, useState } from 'react';

function reducer(state, action) {
  switch (action.type) {
    case 'start': return { phase: 'loading', query: action.query, users: [] };
    case 'ok': return { phase: 'ok', query: action.query, users: action.users };
    case 'fail': return { phase: 'failed', query: action.query, users: [] };
    default: return state;
  }
}

export function UserSearch({ search }) {
  const [draft, setDraft] = useState('');
  const [state, dispatch] = useReducer(reducer, { phase: 'idle', query: '', users: [] });
  const current = useRef(null);

  function start(query) {
    if (current.current) current.current.superseded = true;
    const ticket = { superseded: false };
    current.current = ticket;
    dispatch({ type: 'start', query });
    let pending;
    try {
      pending = Promise.resolve(search(query));
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
        (users) => { if (!ticket.superseded) dispatch({ type: 'ok', query, users }); },
        () => { if (!ticket.superseded) dispatch({ type: 'fail', query }); },
      );
  }

  return (
    <section>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = draft.trim();
          if (q.length > 0) start(q);
        }}
      >
        <label htmlFor="people-q"><span>Search users</span></label>
        <input id="people-q" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button>Search</button>
      </form>

      {state.phase === 'loading' ? <div role="status" className="spinner">Loading…</div> : null}
      {state.phase === 'failed' ? (
        <div role="alert" className="banner">
          <p>Something went wrong.</p>
          <button type="button" onClick={() => start(state.query)}>Retry</button>
        </div>
      ) : null}
      {state.phase === 'ok' ? (
        state.users.length === 0
          ? <div className="empty">No users match "{state.query}"</div>
          : <ol className="results">{state.users.map((u) => <li key={u.id}><span>{u.name}</span></li>)}</ol>
      ) : null}
    </section>
  );
}
