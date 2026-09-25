const STATUSES = ['pending', 'paid', 'cancelled'];
const FIELDS = ['id', 'customer', 'totalCents', 'status', 'createdAt'];
const READONLY = ['id', 'createdAt', 'totalCents'];
const SORTABLE = ['totalCents', 'createdAt'];
const KEY_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

class HttpError extends Error {
  constructor(status, code, message, { details, headers } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

/* ------------------------------------------------------------ plumbing */

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function sendError(res, e) {
  const error = { code: e.code, message: e.message };
  if (e.details !== undefined) error.details = e.details;
  send(res, e.status, { error }, e.headers);
}

function parseJson(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

/* ---------------------------------------------------------- list query */

const convertStatus = (raw) => (STATUSES.includes(raw) ? { value: raw } : { error: `must be one of ${STATUSES.join(', ')}` });
const convertInteger = (raw) => {
  if (!/^-?\d+$/.test(raw)) return { error: 'must be an integer' };
  const n = Number(raw);
  return Number.isSafeInteger(n) ? { value: n } : { error: 'is out of range' };
};

function parseSort(raw) {
  const sort = [];
  for (const item of raw.split(',')) {
    const dir = item.startsWith('-') ? 'desc' : 'asc';
    const field = dir === 'desc' ? item.slice(1) : item;
    if (!SORTABLE.includes(field)) return { error: `cannot sort by "${field}"` };
    if (sort.some((s) => s.field === field)) return { error: `sorts by "${field}" twice` };
    sort.push({ field, dir });
  }
  return { sort };
}

function parseListQuery(params) {
  const details = {};
  const filters = [];
  let sort = [{ field: 'createdAt', dir: 'desc' }];
  let limit = 20;
  let cursor;

  const counts = new Map();
  for (const key of params.keys()) counts.set(key, (counts.get(key) ?? 0) + 1);

  for (const [key, count] of counts) {
    const raw = params.get(key);
    if (count > 1) { details[key] = 'must not be repeated'; continue; }
    switch (key) {
      case 'status': {
        const r = convertStatus(raw);
        if (r.error) details[key] = r.error;
        else filters.push((o) => o.status === r.value);
        break;
      }
      case 'status[in]': {
        const values = [];
        for (const part of raw.split(',')) {
          const r = convertStatus(part);
          if (r.error) { details[key] = `item "${part}" ${r.error}`; break; }
          values.push(r.value);
        }
        if (!details[key]) filters.push((o) => values.includes(o.status));
        break;
      }
      case 'totalCents[gte]':
      case 'totalCents[lte]': {
        const r = convertInteger(raw);
        if (r.error) details[key] = r.error;
        else if (key.endsWith('[gte]')) filters.push((o) => o.totalCents >= r.value);
        else filters.push((o) => o.totalCents <= r.value);
        break;
      }
      case 'sort': {
        const r = parseSort(raw);
        if (r.error) details[key] = r.error;
        else sort = r.sort;
        break;
      }
      case 'limit': {
        const r = convertInteger(raw);
        if (r.error || r.value < 1 || r.value > 100) details[key] = 'must be an integer from 1 to 100';
        else limit = r.value;
        break;
      }
      case 'cursor':
        cursor = raw;
        break;
      default:
        details[key] = 'is not a supported parameter';
    }
  }

  if (Object.keys(details).length > 0) throw new HttpError(400, 'INVALID_QUERY', 'invalid query', { details });
  return { filters, sort, limit, cursor };
}

/* ---------------------------------------------------------- pagination */

// A position is the sort-key values plus the creation sequence (the tiebreaker).
const positionOf = (record, sort) => [...sort.map((s) => record.order[s.field]), record.seq];
const signatureOf = (sort) => sort.map((s) => `${s.field}:${s.dir}`).join(',');

function comparePositions(a, b, sort) {
  for (let i = 0; i < sort.length; i++) {
    if (a[i] === b[i]) continue;
    const r = a[i] < b[i] ? -1 : 1;
    return sort[i].dir === 'desc' ? -r : r;
  }
  return a[sort.length] - b[sort.length];
}

const encodeCursor = (sort, position) =>
  Buffer.from(JSON.stringify({ s: signatureOf(sort), k: position })).toString('base64url');

function decodeCursor(cursor, sort) {
  const invalid = new HttpError(400, 'INVALID_CURSOR', 'invalid cursor');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid;
  }
  if (!isPlainObject(payload) || payload.s !== signatureOf(sort) || !Array.isArray(payload.k) || payload.k.length !== sort.length + 1) {
    throw invalid;
  }
  return payload.k;
}

/* ----------------------------------------------------------- validation */

function validateOrderFields(order, { required }) {
  const details = {};
  for (const key of Object.keys(order)) if (!FIELDS.includes(key)) details[key] = 'is not allowed';
  if ('customer' in order || required.includes('customer')) {
    if (typeof order.customer !== 'string' || order.customer.trim() === '') details.customer = 'must be a non-empty string';
  }
  if ('totalCents' in order || required.includes('totalCents')) {
    if (!Number.isSafeInteger(order.totalCents) || order.totalCents <= 0) details.totalCents = 'must be a positive integer';
  }
  if ('status' in order || required.includes('status')) {
    if (!STATUSES.includes(order.status)) details.status = `must be one of ${STATUSES.join(', ')}`;
  }
  return Object.keys(details).length > 0 ? details : null;
}

function applyMergePatch(target, patch) {
  if (!isPlainObject(patch)) return patch;
  const result = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else result[key] = applyMergePatch(result[key], value);
  }
  return result;
}

function ifMatchSatisfied(header, etag) {
  const tags = header.split(',').map((t) => t.trim());
  return tags.includes('*') || tags.includes(etag);
}

/* ------------------------------------------------------------------ app */

export function createOrdersApi({ now = Date.now } = {}) {
  const records = new Map(); // id -> { order, version, seq }
  const idempotent = new Map(); // key -> { rawBody, response }
  let seq = 0;

  const etagOf = (record) => `"${record.version}"`;

  async function createOrder(req) {
    const key = req.headers['idempotency-key'];
    if (key !== undefined && !KEY_FORMAT.test(key)) {
      throw new HttpError(400, 'INVALID_IDEMPOTENCY_KEY', 'idempotency-key must be 1-64 of A-Z a-z 0-9 _ -');
    }
    const raw = await readBody(req);
    // No await from here on: two retries cannot both miss the stored response.
    if (key !== undefined && idempotent.has(key)) {
      const stored = idempotent.get(key);
      if (stored.rawBody !== raw) throw new HttpError(422, 'IDEMPOTENCY_KEY_REUSED', 'this key was used for a different request');
      return { ...stored.response, headers: { ...stored.response.headers, 'idempotent-replayed': 'true' } };
    }

    const parsed = parseJson(raw);
    if (!parsed.ok || !isPlainObject(parsed.value) || !isPlainObject(parsed.value.data)) {
      throw new HttpError(400, 'INVALID_BODY', 'send { "data": { "customer", "totalCents" } }');
    }
    const input = parsed.value.data;
    const details = validateOrderFields(input, { required: ['customer', 'totalCents'] }) ?? {};
    for (const field of ['id', 'status', 'createdAt']) if (field in input) details[field] = 'is not allowed';
    if (Object.keys(details).length > 0) throw new HttpError(422, 'VALIDATION_FAILED', 'the order is invalid', { details });

    seq += 1;
    const order = {
      id: `ord_${seq}`,
      customer: input.customer,
      totalCents: input.totalCents,
      status: 'pending',
      createdAt: new Date(now()).toISOString(),
    };
    const record = { order, version: 1, seq };
    records.set(order.id, record);
    const response = { status: 201, body: { data: order }, headers: { location: `/orders/${order.id}`, etag: etagOf(record) } };
    if (key !== undefined) idempotent.set(key, { rawBody: raw, response });
    return response;
  }

  function listOrders(url) {
    const { filters, sort, limit, cursor } = parseListQuery(url.searchParams);
    const after = cursor === undefined ? null : decodeCursor(cursor, sort);
    const matching = [...records.values()]
      .filter((r) => filters.every((f) => f(r.order)))
      .filter((r) => after === null || comparePositions(positionOf(r, sort), after, sort) > 0)
      .sort((a, b) => comparePositions(positionOf(a, sort), positionOf(b, sort), sort));
    const page = matching.slice(0, limit);
    const nextCursor = matching.length > limit ? encodeCursor(sort, positionOf(page.at(-1), sort)) : null;
    return { status: 200, body: { data: page.map((r) => r.order), nextCursor } };
  }

  function getOrder(id) {
    const record = records.get(id);
    if (!record) throw new HttpError(404, 'NOT_FOUND', `no order "${id}"`);
    return { status: 200, body: { data: record.order }, headers: { etag: etagOf(record) } };
  }

  async function patchOrder(req, id) {
    const mediaType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (mediaType !== 'application/merge-patch+json') {
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'send application/merge-patch+json');
    }
    const parsed = parseJson(await readBody(req));
    // Every await is behind us: the checks and the write below are atomic.
    if (!parsed.ok) throw new HttpError(400, 'INVALID_JSON', 'body is not valid JSON');
    const patch = parsed.value;
    if (!isPlainObject(patch)) throw new HttpError(400, 'INVALID_PATCH', 'a patch must be a JSON object');

    const record = records.get(id);
    if (!record) throw new HttpError(404, 'NOT_FOUND', `no order "${id}"`);
    const ifMatch = req.headers['if-match'];
    if (ifMatch === undefined) throw new HttpError(428, 'PRECONDITION_REQUIRED', 'send If-Match with the ETag you read');
    if (!ifMatchSatisfied(ifMatch, etagOf(record))) {
      throw new HttpError(412, 'PRECONDITION_FAILED', 'the order changed since you read it', { headers: { etag: etagOf(record) } });
    }

    const fields = Object.keys(patch).filter((k) => READONLY.includes(k));
    if (fields.length > 0) throw new HttpError(422, 'READONLY_FIELD', 'these fields cannot be changed', { details: { fields } });

    const next = applyMergePatch(record.order, patch);
    const details = validateOrderFields(next, { required: ['customer', 'status'] });
    if (details) throw new HttpError(422, 'VALIDATION_FAILED', 'the patched order is invalid', { details });

    const updated = { ...record, order: next, version: record.version + 1 };
    records.set(id, updated);
    return { status: 200, body: { data: next }, headers: { etag: etagOf(updated) } };
  }

  async function route(req) {
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'orders' || parts.length > 2) throw new HttpError(404, 'NOT_FOUND', 'no such route');

    if (parts.length === 1) {
      if (req.method === 'GET') return listOrders(url);
      if (req.method === 'POST') return createOrder(req);
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', `${req.method} is not supported here`, { headers: { allow: 'GET, POST' } });
    }
    const id = decodeURIComponent(parts[1]);
    if (req.method === 'GET') return getOrder(id);
    if (req.method === 'PATCH') return patchOrder(req, id);
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', `${req.method} is not supported here`, { headers: { allow: 'GET, PATCH' } });
  }

  return async (req, res) => {
    try {
      const r = await route(req);
      send(res, r.status, r.body, r.headers);
    } catch (e) {
      if (e instanceof HttpError) sendError(res, e);
      else send(res, 500, { error: { code: 'INTERNAL', message: 'internal error' } });
    }
  };
}
