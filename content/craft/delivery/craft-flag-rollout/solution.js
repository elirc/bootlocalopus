/** FNV-1a, 32 bit: a fast, well-spread string hash. Returns an unsigned integer. */
export function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const BUCKETS = 10_000; // 0.01 % each

/**
 * Which of 10,000 buckets this user falls in for this flag. Hashing the flag
 * key with the id makes each flag's rollout independent of every other's,
 * and the same inputs always give the same bucket (sticky across requests
 * and servers).
 */
function bucketOf(flagKey, userId) {
  return fnv1a32(`${flagKey}:${userId}`) % BUCKETS;
}

const matches = (rule, user) => user[rule.attribute] !== undefined && rule.in.includes(user[rule.attribute]);

/**
 * Decides whether `flag` is on for `user`, and why.
 * Returns { enabled, reason }.
 */
export function evaluateFlag(flag, user) {
  const percent = flag.rolloutPercent;
  if (typeof percent !== 'number' || !(percent >= 0 && percent <= 100)) {
    throw new RangeError(`flag ${flag.key}: rolloutPercent must be a number from 0 to 100, got ${percent}`);
  }

  const id = user.id ?? null;
  if (!flag.enabled) return { enabled: false, reason: 'killed' };
  if (id !== null && (flag.deny ?? []).includes(id)) return { enabled: false, reason: 'denied' };
  if (id !== null && (flag.allow ?? []).includes(id)) return { enabled: true, reason: 'allowed' };
  if (!(flag.rules ?? []).every((rule) => matches(rule, user))) return { enabled: false, reason: 'not-targeted' };
  if (percent === 100) return { enabled: true, reason: 'rollout' };
  if (id === null) return { enabled: false, reason: 'anonymous' };

  // Monotonic: raising the percentage only ever adds buckets below the line.
  return { enabled: bucketOf(flag.key, id) < Math.round(percent * 100), reason: 'rollout' };
}
