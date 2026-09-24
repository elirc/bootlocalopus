import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export function createApi({ token = 'secret-token', now = () => new Date('2024-01-01') } = {}) {
  const notes = new Map();
  let nextId = 1;

  const send = (res, status, body) => {
    if (status === 204) {
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const fail = (res, status, code, message, details) =>
    send(res, status, { error: { code, message, ...(details ? { details } : {}) } });

  const readJson = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      return parsed;
    } catch {
      return null;   // signals "invalid body" to the caller
    }
  };

  const ALLOWED = ['title', 'body', 'tags'];

  /** Returns { value } or { details } — never both. */
  const validate = (input, { partial }) => {
    const details = {};
    const value = {};

    for (const key of Object.keys(input)) {
      if (!ALLOWED.includes(key)) details[key] = 'unknown field';
    }

    if ('title' in input) {
      const title = input.title;
      if (typeof title !== 'string') details.title = 'must be a string';
      else if (title.trim().length < 1) details.title = 'must not be empty';
      else if (title.trim().length > 80) details.title = 'must be at most 80 characters';
      else value.title = title.trim();
    } else if (!partial) {
      details.title = 'is required';
    }

    if ('body' in input) {
      if (typeof input.body !== 'string') details.body = 'must be a string';
      else value.body = input.body;
    } else if (!partial) {
      value.body = '';
    }

    if ('tags' in input) {
      const tags = input.tags;
      if (!Array.isArray(tags)) details.tags = 'must be an array of strings';
      else if (tags.some((tag) => typeof tag !== 'string' || !tag.trim())) {
        details.tags = 'must be an array of non-empty strings';
      } else value.tags = tags;
    } else if (!partial) {
      value.tags = [];
    }

    if (partial && Object.keys(value).length === 0 && Object.keys(details).length === 0) {
      details._ = 'at least one field is required';
    }

    return Object.keys(details).length ? { details } : { value };
  };

  const parseListQuery = (searchParams) => {
    const details = {};
    let limit = 10;
    let offset = 0;

    const rawLimit = searchParams.get('limit');
    if (rawLimit !== null) {
      if (!/^\d+$/.test(rawLimit)) details.limit = 'must be an integer';
      else if (Number(rawLimit) < 1) details.limit = 'must be at least 1';
      else if (Number(rawLimit) > 50) details.limit = 'must be at most 50';
      else limit = Number(rawLimit);
    }

    const rawOffset = searchParams.get('offset');
    if (rawOffset !== null) {
      if (!/^\d+$/.test(rawOffset)) details.offset = 'must be a non-negative integer';
      else offset = Number(rawOffset);
    }

    return Object.keys(details).length
      ? { details }
      : { value: { limit, offset, tag: searchParams.get('tag') } };
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (pathname === '/health') {
      return req.method === 'GET'
        ? send(res, 200, { status: 'ok' })
        : fail(res, 405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }

    // Constant-time compare, as in the signed-tokens lesson: `!==` returns as
    // soon as a character differs, which leaks how much of a guess was right.
    const given = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from('Bearer ' + token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return fail(res, 401, 'UNAUTHORIZED', 'authentication required');
    }

    const idMatch = pathname.match(/^\/notes\/([^/]+)$/);

    try {
      if (pathname === '/notes' && req.method === 'POST') {
        const input = await readJson(req);
        if (input === null) return fail(res, 400, 'BAD_REQUEST', 'invalid json');

        const { value, details } = validate(input, { partial: false });
        if (details) return fail(res, 400, 'BAD_REQUEST', 'validation failed', details);

        const timestamp = now();
        const note = {
          id: String(nextId++),
          ...value,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        notes.set(note.id, note);
        return send(res, 201, note);
      }

      if (pathname === '/notes' && req.method === 'GET') {
        const { value, details } = parseListQuery(url.searchParams);
        if (details) return fail(res, 400, 'BAD_REQUEST', 'invalid query', details);

        // Newest first by createdAt; the id breaks ties (two notes created in
        // the same millisecond), so the order is always total.
        let all = [...notes.values()].sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt) || Number(b.id) - Number(a.id),
        );
        if (value.tag) all = all.filter((note) => note.tags.includes(value.tag));

        const page = all.slice(value.offset, value.offset + value.limit);
        return send(res, 200, {
          items: page,
          total: page.length,
          limit: value.limit,
          offset: value.offset,
        });
      }

      if (idMatch) {
        const id = idMatch[1];
        const existing = notes.get(id);

        if (req.method === 'GET') {
          return existing
            ? send(res, 200, existing)
            : fail(res, 404, 'NOT_FOUND', 'note ' + id + ' not found');
        }

        if (req.method === 'PATCH') {
          if (!existing) return fail(res, 404, 'NOT_FOUND', 'note ' + id + ' not found');
          const input = await readJson(req);
          if (input === null) return fail(res, 400, 'BAD_REQUEST', 'invalid json');

          const { value, details } = validate(input, { partial: true });
          if (details) return fail(res, 400, 'BAD_REQUEST', 'validation failed', details);

          const updated = { ...existing, ...value, updatedAt: now() };
          notes.set(id, updated);
          return send(res, 200, updated);
        }

        if (req.method === 'DELETE') {
          if (!existing) return fail(res, 404, 'NOT_FOUND', 'note ' + id + ' not found');
          notes.delete(id);
          return send(res, 204);
        }

        return fail(res, 405, 'METHOD_NOT_ALLOWED', 'method not allowed');
      }

      return fail(res, 404, 'NOT_FOUND', 'not found');
    } catch {
      return fail(res, 500, 'INTERNAL', 'internal server error');
    }
  });

  return { server };
}
