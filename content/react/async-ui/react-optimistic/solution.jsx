import { useState } from 'react';

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
      setLiked(prevLiked);
      setLikes(prevLikes);
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
