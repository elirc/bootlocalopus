/** FNV-1a, 32 bit: a fast, well-spread string hash. Returns an unsigned integer. */
export function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Decides whether `flag` is on for `user`, and why.
 * Returns { enabled, reason }.
 */
export function evaluateFlag(flag, user) {
  // The version in production: fresh dice on every request.
  if (!flag.enabled) return { enabled: false, reason: 'killed' };
  return { enabled: Math.random() * 100 < flag.rolloutPercent, reason: 'rollout' };
}
