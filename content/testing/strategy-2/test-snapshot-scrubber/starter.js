/**
 * Makes a value safe to snapshot: a deep copy with keys sorted, timestamps
 * and UUIDs replaced by stable placeholders, and secret keys redacted.
 */
export function scrub(value, { redact = [] } = {}) {
  // The version everyone writes first: a JSON round trip. It copies the
  // value and sorts nothing, replaces nothing, redacts nothing.
  return JSON.parse(JSON.stringify(value));
}
