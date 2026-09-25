const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** RFC 7396. Builds a new object; neither argument is modified. */
export function applyMergePatch(target, patch) {
  if (!isPlainObject(patch)) return patch;
  const result = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
    } else {
      // Recursing (rather than assigning) is what merges nested objects and
      // strips nulls from objects that did not exist in the target.
      // defineProperty keeps a "__proto__" key an ordinary field.
      Object.defineProperty(result, key, {
        value: applyMergePatch(result[key], value),
        enumerable: true, writable: true, configurable: true,
      });
    }
  }
  return result;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const fail = (res, status, code, message, details) =>
  send(res, status, { error: details === undefined ? { code, message } : { code, message, details } });

export function createPatchHandler({ load, save, readonly = [], validate = () => null }) {
  return async (req, res) => {
    const mediaType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (mediaType !== 'application/merge-patch+json') {
      return fail(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'send application/merge-patch+json');
    }

    let patch;
    try {
      patch = JSON.parse(await readBody(req));
    } catch {
      return fail(res, 400, 'INVALID_JSON', 'body is not valid JSON');
    }
    if (!isPlainObject(patch)) return fail(res, 400, 'INVALID_PATCH', 'a patch must be a JSON object');

    const path = new URL(req.url, 'http://x').pathname;
    const id = decodeURIComponent(path.split('/').filter(Boolean).at(-1) ?? '');
    const current = await load(id);
    if (current === undefined) return fail(res, 404, 'NOT_FOUND', `nothing stored under "${id}"`);

    const fields = Object.keys(patch).filter((key) => readonly.includes(key));
    if (fields.length > 0) return fail(res, 422, 'READONLY_FIELD', 'these fields cannot be changed', { fields });

    // Build the candidate separately; the stored object is only replaced by save().
    const next = applyMergePatch(current, patch);
    const errors = validate(next);
    if (errors) return fail(res, 422, 'VALIDATION_FAILED', 'the patched resource is invalid', errors);

    await save(id, next);
    send(res, 200, { data: next });
  };
}
