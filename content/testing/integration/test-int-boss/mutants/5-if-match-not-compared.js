import http from 'node:http';

/**
 * Orders API. `users` maps a bearer token to { id, role } where role is 'customer' or 'admin'.
 * Customers see and change only their own orders; admins see and change all of them.
 */
export function createApp({ users }) {
  const orders = new Map();
  let nextId = 1;

  const send = (res, status, body, headers = {}) => {
    if (body === undefined) {
      res.writeHead(status, headers);
      return res.end();
    }
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };
  const fail = (res, status, code) => send(res, status, { error: { code, message: code.toLowerCase().replaceAll('_', ' ') } });
  const etag = (order) => `"${order.version}"`;
  const withTag = (res, status, order) => send(res, status, order, { etag: etag(order) });

  const readJson = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      return null;
    }
  };

  const validItems = (items) =>
    Array.isArray(items) && items.length > 0 &&
    items.every((i) => i && typeof i.sku === 'string' && Number.isInteger(i.qty) && i.qty > 0);

  const canSee = (user, order) => user.role === 'admin' || order.owner === user.id;

  return http.createServer(async (req, res) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const user = users[token];
    if (!user || !Object.hasOwn(users, token)) return fail(res, 401, 'UNAUTHORIZED');

    const { pathname } = new URL(req.url, 'http://localhost');

    if (pathname === '/orders' && req.method === 'POST') {
      const input = await readJson(req);
      if (!input || !validItems(input.items)) return fail(res, 400, 'VALIDATION');
      const order = { id: String(nextId++), owner: user.id, status: 'open', items: input.items, version: 1 };
      orders.set(order.id, order);
      return withTag(res, 201, order);
    }

    if (pathname === '/orders' && req.method === 'GET') {
      const items = [...orders.values()].filter((o) => canSee(user, o));
      return send(res, 200, { items });
    }

    const match = pathname.match(/^\/orders\/([^/]+)(\/cancel)?$/);
    if (!match) return fail(res, 404, 'NOT_FOUND');
    const order = orders.get(match[1]);
    // Someone else's order is "not found", not "forbidden": do not confirm that it exists.
    if (!order || !canSee(user, order)) return fail(res, 404, 'NOT_FOUND');

    if (match[2]) {
      if (req.method !== 'POST') return fail(res, 405, 'METHOD_NOT_ALLOWED');
      if (order.status !== 'open') return fail(res, 409, 'CONFLICT');
      order.status = 'cancelled';
      order.version += 1;
      return withTag(res, 200, order);
    }

    if (req.method === 'GET') return withTag(res, 200, order);

    if (req.method === 'PATCH') {
      const ifMatch = req.headers['if-match'];
      if (!ifMatch) return fail(res, 428, 'PRECONDITION_REQUIRED');
      if (order.status !== 'open') return fail(res, 409, 'CONFLICT');
      const input = await readJson(req);
      if (!input || !validItems(input.items)) return fail(res, 400, 'VALIDATION');
      order.items = input.items;
      order.version += 1;
      return withTag(res, 200, order);
    }

    if (req.method === 'DELETE') {
      if (user.role !== 'admin') return fail(res, 403, 'FORBIDDEN'); // they can see it, but may not delete it
      orders.delete(order.id);
      return send(res, 204);
    }

    return fail(res, 405, 'METHOD_NOT_ALLOWED');
  });
}
