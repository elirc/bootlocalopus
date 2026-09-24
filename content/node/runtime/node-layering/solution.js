import http from 'node:http';

export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}
export class ConflictError extends Error {
  constructor(message) { super(message); this.name = 'ConflictError'; }
}
export class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}

export function createMemoryUserRepo() {
  const rows = new Map();
  let nextId = 1;

  // Data access only: no validation, no rules.
  return {
    async insert(data) {
      const id = String(nextId++);
      const row = { id, ...data };
      rows.set(id, row);
      return row;
    },
    async findById(id) {
      return rows.get(String(id)) ?? null;
    },
    async findByEmail(email) {
      return [...rows.values()].find((row) => row.email === email) ?? null;
    },
    async update(id, patch) {
      const existing = rows.get(String(id));
      if (!existing) return null;
      const updated = { ...existing, ...patch };
      rows.set(String(id), updated);
      return updated;
    },
    async all() {
      return [...rows.values()];
    },
  };
}

const isEmail = (value) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+$/.test(value.trim());

export function createUserService({ users, now = () => new Date('2024-01-01') }) {
  return {
    async register({ email, name } = {}) {
      if (!isEmail(email)) throw new ValidationError('a valid email is required');
      if (typeof name !== 'string' || !name.trim()) throw new ValidationError('name is required');

      const normalised = email.trim().toLowerCase();
      if (await users.findByEmail(normalised)) {
        throw new ConflictError('email already registered');
      }

      return users.insert({
        email: normalised,
        name: name.trim(),
        active: true,
        createdAt: now(),
      });
    },

    async getById(id) {
      const user = await users.findById(id);
      if (!user) throw new NotFoundError('user ' + id + ' not found');
      return user;
    },

    async deactivate(id) {
      const user = await users.findById(id);
      if (!user) throw new NotFoundError('user ' + id + ' not found');
      if (!user.active) return user;   // idempotent
      return users.update(id, { active: false });
    },

    async list({ activeOnly = false } = {}) {
      const all = await users.all();
      return activeOnly ? all.filter((user) => user.active) : all;
    },
  };
}

const STATUS_BY_ERROR = {
  ValidationError: 400,
  ConflictError: 409,
  NotFoundError: 404,
};

export function createUserHandler(service) {
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const readBody = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw new ValidationError('invalid json');
    }
  };

  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const idMatch = url.pathname.match(/^\/users\/([^/]+)$/);

    try {
      if (req.method === 'POST' && url.pathname === '/users') {
        return send(res, 201, await service.register(await readBody(req)));
      }
      if (req.method === 'GET' && url.pathname === '/users') {
        return send(res, 200, await service.list({
          activeOnly: url.searchParams.get('activeOnly') === 'true',
        }));
      }
      if (req.method === 'GET' && idMatch) {
        return send(res, 200, await service.getById(idMatch[1]));
      }
      if (req.method === 'DELETE' && idMatch) {
        return send(res, 200, await service.deactivate(idMatch[1]));
      }
      return send(res, 404, { error: 'not found' });
    } catch (error) {
      const status = STATUS_BY_ERROR[error?.name] ?? 500;
      send(res, status, { error: status === 500 ? 'internal error' : error.message });
    }
  };
}
