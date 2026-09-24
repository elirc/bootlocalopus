import { useEffect, useId, useRef, useState } from 'react';

/* ------------------------------------------------------------ LikeButton */

export function LikeButton({ initialLikes, initialLiked, save }) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(initialLiked);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const click = async () => {
    const prevLiked = liked;
    const prevLikes = likes;
    const next = !liked;

    // Optimistic: paint the new state before the server agrees.
    setLiked(next);
    setLikes(prevLikes + (next ? 1 : -1));
    setFailed(false);
    setSaving(true);

    try {
      await save(next);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button onClick={click} disabled={saving}>{liked ? 'Unlike' : 'Like'}</button>
      <span data-testid="count">{likes}</span>
      {failed && <p role="alert">Could not save. Try again.</p>}
    </div>
  );
}

/* ----------------------------------------------------------------- Modal */

export function Modal({ open, onClose, title, children }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  // Parents pass `onClose` inline; read the latest through a ref so the
  // effect below depends only on `open`.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Send focus back where the user left it.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      ref={dialogRef}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <button onClick={onClose}>Close</button>
    </div>
  );
}
