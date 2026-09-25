const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Makes a value safe to snapshot: a deep copy with keys sorted, timestamps
 * and UUIDs replaced by stable placeholders, and secret keys redacted.
 */
export function scrub(value, { redact = [] } = {}) {
  const secret = new Set(redact);
  const uuids = new Map(); // lower-cased uuid -> placeholder, numbered by first appearance

  const placeholderFor = (uuid) => {
    const key = uuid.toLowerCase();
    if (!uuids.has(key)) uuids.set(key, `<uuid-${uuids.size + 1}>`);
    return uuids.get(key);
  };

  const walk = (v) => {
    if (v instanceof Date) return '<timestamp>';
    if (typeof v === 'string') {
      if (ISO_TIMESTAMP.test(v)) return '<timestamp>';
      return v.replace(UUID, placeholderFor);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      const out = {};
      for (const key of Object.keys(v).sort()) {
        out[key] = secret.has(key) ? '<redacted>' : walk(v[key]);
      }
      return out;
    }
    return v;
  };

  return walk(value);
}
