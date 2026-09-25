// Same behaviour: a route table, a policy object, "rev-N" ETags, reworded messages.
import http from 'node:http';

const policy = {
  view: (user, order) => order.owner === user.id || user.role === 'admin',
  remove: (user) => user.role === 'admin',
};

export function createApp({ users }) {
  const store = new Map();
  let seq = 0;

  const tagOf = (o) => `"rev-${o.version}"`;
  const reply = (res, status, body, headers = {}) => {
    const h = body === undefined ? headers : { ...headers, 'content-type': 'application/json; charset=utf-8' };
    res.writeHead(status, h);
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const problem = (res, status, code) => reply(res, status, { error: { message: `request refused (${status})`, code } });
  const ok = (res, status, order) => reply(res, status, { version: order.version, items: order.items, status: order.status, owner: order.owner, id: order.id }, { ETag: tagOf(order) });

  async function body(req) {
    let raw = '';
    for await (const c of req) raw += c;
    if (raw.trim() === '') return {};
    try { return JSON.parse(raw); } catch { return null; }
  }
  const itemsOk = (items) => Array.isArray(items) && items.length >= 1 &&
    !items.some((i) => !i || typeof i.sku !== 'string' || !Number.isInteger(i.qty) || i.qty < 1);

  async function create(req, res, user) {
    const input = await body(req);
    if (!input || !itemsOk(input.items)) return problem(res, 400, 'VALIDATION');
    seq += 1;
    const order = { id: `${seq}`, owner: user.id, status: 'open', items: input.items, version: 1 };
    store.set(order.id, order);
    return ok(res, 201, order);
  }

  async function update(req, res, order) {
    const given = req.headers['if-match'];
    if (given === undefined || given === '') return problem(res, 428, 'PRECONDITION_REQUIRED');
    if (given !== tagOf(order)) return problem(res, 412, 'PRECONDITION_FAILED');
    if (order.status === 'cancelled') return problem(res, 409, 'CONFLICT');
    const input = await body(req);
    if (!input || !itemsOk(input.items)) return problem(res, 400, 'VALIDATION');
    Object.assign(order, { items: input.items, version: order.version + 1 });
    return ok(res, 200, order);
  }

  return http.createServer(async (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    const user = Object.hasOwn(users, token) ? users[token] : undefined;
    if (!user) return problem(res, 401, 'UNAUTHORIZED');

    const path = new URL(req.url, 'http://h').pathname;
    if (path === '/orders') {
      if (req.method === 'POST') return create(req, res, user);
      if (req.method === 'GET') return reply(res, 200, { items: [...store.values()].filter((o) => policy.view(user, o)) });
      return problem(res, 404, 'NOT_FOUND');
    }

    const m = /^\/orders\/([^/]+)(\/cancel)?$/.exec(path);
    const order = m ? store.get(m[1]) : undefined;
    if (!order || !policy.view(user, order)) return problem(res, 404, 'NOT_FOUND');

    if (m[2] !== undefined) {
      if (req.method !== 'POST') return problem(res, 405, 'METHOD_NOT_ALLOWED');
      if (order.status === 'cancelled') return problem(res, 409, 'CONFLICT');
      Object.assign(order, { status: 'cancelled', version: order.version + 1 });
      return ok(res, 200, order);
    }

    switch (req.method) {
      case 'GET': return ok(res, 200, order);
      case 'PATCH': return update(req, res, order);
      case 'DELETE':
        if (!policy.remove(user)) return problem(res, 403, 'FORBIDDEN');
        store.delete(order.id);
        return reply(res, 204);
      default: return problem(res, 405, 'METHOD_NOT_ALLOWED');
    }
  });
}
