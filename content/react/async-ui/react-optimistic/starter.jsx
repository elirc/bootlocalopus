import { useState } from 'react';

export function LikeButton({ initialLikes, initialLiked, save }) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(initialLiked);

  // TODO: optimistic update, disable while saving, roll back on failure
  return null;
}
