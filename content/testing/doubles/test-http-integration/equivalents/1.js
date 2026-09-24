// Same contract, different implementation: a route table, a store class,
// reworded messages, a charset on the content type, and a different key order.
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class NoteStore {
  #notes = new Map();
  #seq = 0;
  create(fields, at) {
    const id = String(++this.#seq);
    const note = { ...fields, id, updatedAt: at, createdAt: at };
    this.#notes.set(id, note);
    return note;
  }
  get(id) { return this.#notes.get(id); }
  put(note) { this.#notes.set(note.id, note); return note; }
  remove(id) { return this.#notes.delete(id); }
  newestFirst() { return [...this.#notes.values()].sort((a, b) => Number(b.id) - Number(a.id)); }
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

function checkNote(input, partial) {
  const problems = {};
  const fields = {};
  for (const key of Object.keys(input)) {
    if (key !== 'title' && key !== 'body' && key !== 'tags') problems[key] = 'not allowed';
  }
  if (input.title !== undefined || 'title' in input) {
    if (typeof input.title !== 'string') problems.title = 'expected a string';
    else if (!input.title.trim()) problems.title = 'cannot be blank';
    else if (input.title.trim().length > 80) problems.title = 'too long (80 max)';
    else fields.title = input.title.trim();
  } else if (!partial) problems.title = 'required';

  if ('body' in input) {
    if (typeof input.body === 'string') fields.body = input.body;
    else problems.body = 'expected a string';
  } else if (!partial) fields.body = '';

  if ('tags' in input) {
    if (Array.isArray(input.tags) && input.tags.every(isNonEmptyString)) fields.tags = input.tags;
    else problems.tags = 'expected an array of non-empty strings';
  } else if (!partial) fields.tags = [];

  if (partial && !Object.keys(fields).length && !Object.keys(problems).length) problems._ = 'nothing to update';
  if (Object.keys(problems).length) throw new HttpError(400, 'BAD_REQUEST', 'the request body is invalid', problems);
  return fields;
}

async function bodyOf(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  if (!text.trim()) return {};
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = undefined; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'BAD_REQUEST', 'body is not a JSON object');
  }
  return parsed;
}

function pageParams(query) {
  const problems = {};
  const read = (name, fallback, min, max) => {
    const raw = query.get(name);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw)) { problems[name] = 'not a whole number'; return fallback; }
    const n = Number(raw);
    if (n < min) problems[name] = `below ${min}`;
    else if (n > max) problems[name] = `above ${max}`;
    return n;
  };
  const limit = read('limit', 10, 1, 50);
  const offset = read('offset', 0, 0, Infinity);
  if (Object.keys(problems).length) throw new HttpError(400, 'BAD_REQUEST', 'bad query string', problems);
  return { limit, offset, tag: query.get('tag') };
}

export function createApi({ token = 'secret-token', now = () => new Date('2024-01-01') } = {}) {
  const store = new NoteStore();
  const expected = Buffer.from(`Bearer ${token}`);
  const authorised = (req) => {
    const given = Buffer.from(req.headers.authorization ?? '');
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  const find = (id) => {
    const note = store.get(id);
    if (!note) throw new HttpError(404, 'NOT_FOUND', 'no such note');
    return note;
  };

  const routes = {
    '/notes': {
      async POST({ req }) {
        const fields = checkNote(await bodyOf(req), false);
        return [201, store.create(fields, now())];
      },
      async GET({ url }) {
        const { limit, offset, tag } = pageParams(url.searchParams);
        const matching = store.newestFirst().filter((n) => tag === null || n.tags.includes(tag));
        return [200, { total: matching.length, offset, limit, items: matching.slice(offset, offset + limit) }];
      },
    },
    '/notes/:id': {
      async GET({ id }) { return [200, find(id)]; },
      async PATCH({ id, req }) {
        const existing = find(id);
        const fields = checkNote(await bodyOf(req), true);
        return [200, store.put({ ...existing, ...fields, updatedAt: now() })];
      },
      async DELETE({ id }) { find(id); store.remove(id); return [204]; },
    },
  };

  const reply = (res, status, body) => {
    if (body === undefined) { res.writeHead(status); res.end(); return; }
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const replyError = (res, e) =>
    reply(res, e.status, { error: { message: e.message, code: e.code, ...(e.details ? { details: e.details } : {}) } });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/health') {
        if (req.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'use GET');
        return reply(res, 200, { status: 'ok' });
      }
      if (!authorised(req)) throw new HttpError(401, 'UNAUTHORIZED', 'missing or invalid bearer token');

      const m = url.pathname.match(/^\/notes\/([^/]+)$/);
      const table = url.pathname === '/notes' ? routes['/notes'] : m ? routes['/notes/:id'] : null;
      if (!table) throw new HttpError(404, 'NOT_FOUND', 'no such route');
      const handler = table[req.method];
      if (!handler) {
        if (m) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'method not supported here');
        throw new HttpError(404, 'NOT_FOUND', 'no such route');
      }
      const [status, body] = await handler({ req, url, id: m?.[1] });
      return reply(res, status, body);
    } catch (e) {
      if (e instanceof HttpError) return replyError(res, e);
      return replyError(res, new HttpError(500, 'INTERNAL', 'something went wrong'));
    }
  });

  return { server };
}
