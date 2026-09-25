// Same behaviour: a route table, reworded messages, a charset on responses, Allow in another order.
import http from 'node:http';

export const MAX_BODY_BYTES = 1024;

const JSON_TYPE = /^application\/json\s*(;|$)/i;

export function createApp() {
  const store = new Map();
  let counter = 0;

  const reply = (res, status, body, extra = {}) => {
    const headers = body === undefined ? extra : { ...extra, 'content-type': 'application/json; charset=utf-8' };
    res.writeHead(status, headers);
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const problem = (res, status, code, extra) => reply(res, status, { error: { message: `request failed: ${code.toLowerCase()}`, code } }, extra);

  async function body(req) {
    let size = 0;
    const parts = [];
    for await (const part of req) {
      size += part.length;
      parts.push(part);
    }
    return { size, text: Buffer.concat(parts).toString('utf8') };
  }

  const routes = [
    {
      pattern: /^\/bookmarks$/,
      methods: {
        POST: async (req, res) => {
          if (!JSON_TYPE.test(req.headers['content-type'] || '')) return problem(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
          const { size, text } = await body(req);
          if (size > MAX_BODY_BYTES) return problem(res, 413, 'PAYLOAD_TOO_LARGE');
          let data;
          try { data = JSON.parse(text); } catch { return problem(res, 400, 'INVALID_JSON'); }
          const url = data?.url;
          if (typeof url !== 'string' || !(url.startsWith('http://') || url.startsWith('https://'))) {
            return problem(res, 400, 'VALIDATION');
          }
          counter += 1;
          const id = `${counter}`;
          const item = { note: typeof data.note === 'string' ? data.note : '', url, id };
          store.set(id, item);
          return reply(res, 201, item, { location: '/bookmarks/' + id });
        },
        GET: (req, res) => reply(res, 200, { items: Array.from(store.values()) }),
      },
    },
    {
      pattern: /^\/bookmarks\/([^/]+)$/,
      methods: {
        DELETE: (req, res, id) => {
          if (!store.delete(id)) return problem(res, 404, 'NOT_FOUND');
          return reply(res, 204);
        },
        GET: (req, res, id) => (store.has(id) ? reply(res, 200, store.get(id)) : problem(res, 404, 'NOT_FOUND')),
      },
    },
  ];

  return http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    try {
      for (const route of routes) {
        const m = route.pattern.exec(path);
        if (!m) continue;
        const handler = route.methods[req.method];
        if (!handler) return problem(res, 405, 'METHOD_NOT_ALLOWED', { allow: Object.keys(route.methods).join(',') });
        return await handler(req, res, m[1]);
      }
      return problem(res, 404, 'NOT_FOUND');
    } catch {
      return problem(res, 500, 'INTERNAL');
    }
  });
}
