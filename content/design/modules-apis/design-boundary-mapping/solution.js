export class RequestValidationError extends Error {
  constructor(fields) {
    super('Invalid request');
    this.name = 'RequestValidationError';
    this.fields = fields;
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Row -> response. An allowlist: a column added next year is private until someone adds it here. */
export function toUserResponse(row, viewer) {
  const base = {
    id: String(row.id),
    displayName: row.display_name,
    createdAt: row.created_at.toISOString(),
  };
  const privileged = viewer != null && (viewer.role === 'admin' || String(viewer.id) === String(row.id));
  return privileged ? { ...base, email: row.email, role: row.role } : base;
}

export function toUserListResponse(rows, viewer, nextCursor = null) {
  return { data: rows.map((row) => toUserResponse(row, viewer)), nextCursor };
}

function checkDisplayName(value, fields) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 50) {
    fields.displayName = 'must be 1-50 characters';
    return undefined;
  }
  return value.trim();
}

/** Request -> input for the service. Reads only the fields a client may set. */
export function fromCreateUserRequest(body) {
  if (!isPlainObject(body)) throw new RequestValidationError({ body: 'must be a JSON object' });
  const fields = {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email)) fields.email = 'must be an email address';
  const displayName = checkDisplayName(body.displayName, fields);
  if (Object.keys(fields).length > 0) throw new RequestValidationError(fields);
  return { email, displayName };
}

export function fromUpdateUserRequest(body) {
  if (!isPlainObject(body)) throw new RequestValidationError({ body: 'must be a JSON object' });
  const fields = {};
  const patch = {};
  if (body.displayName !== undefined) {
    const displayName = checkDisplayName(body.displayName, fields);
    if (displayName !== undefined) patch.displayName = displayName;
  }
  if (Object.keys(fields).length > 0) throw new RequestValidationError(fields);
  if (Object.keys(patch).length === 0) throw new RequestValidationError({ body: 'nothing to update' });
  return patch;
}
