// Same behaviour, different markup: a reducer, other elements, class names,
// extra wrappers, a different heading level, and a <section> as the dialog.
import { useEffect, useId, useReducer, useRef } from 'react';

function likeReducer(state, action) {
  switch (action.type) {
    case 'toggle':
      return { ...state, liked: !state.liked, likes: state.likes + (state.liked ? -1 : 1), pending: true, error: null };
    case 'saved':
      return { ...state, pending: false };
    case 'failed':
      return { liked: action.before.liked, likes: action.before.likes, pending: false, error: 'Could not save. Try again.' };
    default:
      return state;
  }
}

export function LikeButton({ initialLikes, initialLiked, save }) {
  const [state, dispatch] = useReducer(likeReducer, { likes: initialLikes, liked: initialLiked, pending: false, error: null });

  async function onToggle() {
    const before = { liked: state.liked, likes: state.likes };
    dispatch({ type: 'toggle' });
    try {
      await save(!before.liked);
      dispatch({ type: 'saved' });
    } catch {
      dispatch({ type: 'failed', before });
    }
  }

  return (
    <section className="like-widget">
      <div className="like-widget__row">
        <button type="button" className="btn btn--ghost" aria-pressed={state.liked} disabled={state.pending} onClick={onToggle}>
          <span className="btn__label">{state.liked ? 'Unlike' : 'Like'}</span>
        </button>
        <output className="like-widget__count" data-testid="count">{state.likes}</output>
      </div>
      {state.error ? <div className="toast toast--error" role="alert">{state.error}</div> : null}
    </section>
  );
}

export function Modal({ open, onClose, title, children }) {
  const headingId = useId();
  const root = useRef(null);
  const latestOnClose = useRef(onClose);
  latestOnClose.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const returnTo = document.activeElement;
    root.current.focus();
    const handler = (e) => {
      if (e.key === 'Escape') latestOnClose.current();
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      if (returnTo && typeof returnTo.focus === 'function') returnTo.focus();
    };
  }, [open]);

  return open ? (
    <div className="overlay">
      <section className="modal modal--centered" role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1} ref={root}>
        <header className="modal__header">
          <h3 className="modal__title" id={headingId}>{title}</h3>
        </header>
        <div className="modal__body">{children}</div>
        <footer className="modal__footer">
          <button type="button" className="btn" onClick={() => onClose()}>Close</button>
        </footer>
      </section>
    </div>
  ) : null;
}
