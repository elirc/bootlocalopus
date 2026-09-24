export class NotFoundError extends Error {
  constructor(message = 'note not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Data access only. It stores what it is given and knows nothing about owners. */
export function createNoteRepo() {
  const rows = new Map();
  let nextId = 1;
  return {
    async insert(data) {
      const note = { ...data, id: String(nextId++) };
      rows.set(note.id, note);
      return { ...note };
    },
    async findById(id) {
      const note = rows.get(String(id));
      return note ? { ...note } : null;
    },
    async findByOwner(ownerId) {
      return [...rows.values()].filter((n) => n.ownerId === ownerId).map((n) => ({ ...n }));
    },
    async all() {
      return [...rows.values()].map((n) => ({ ...n }));
    },
    async update(id, patch) {
      const existing = rows.get(String(id));
      if (!existing) return null;
      const updated = { ...existing, ...patch };
      rows.set(existing.id, updated);
      return { ...updated };
    },
    async delete(id) {
      return rows.delete(String(id));
    },
  };
}

const isAdmin = (actor) => actor?.role === 'admin';
const canAccess = (actor, note) => isAdmin(actor) || note.ownerId === actor.id;

/** Only these fields ever come from the client. Everything else is ours to decide. */
const pickEditable = (input = {}) => {
  const out = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.body !== undefined) out.body = input.body;
  return out;
};

export function createNoteService({ notes }) {
  // One place that loads a note *for an actor*. A foreign note and a missing
  // note are indistinguishable from outside: same class, same message.
  const loadFor = async (actor, id) => {
    const note = await notes.findById(id);
    if (!note || !canAccess(actor, note)) throw new NotFoundError('note not found');
    return note;
  };

  return {
    async create(actor, input) {
      const { title, body } = pickEditable(input);
      return notes.insert({ ownerId: actor.id, title, body });
    },

    async get(actor, id) {
      return loadFor(actor, id);
    },

    async list(actor) {
      return isAdmin(actor) ? notes.all() : notes.findByOwner(actor.id);
    },

    async update(actor, id, patch) {
      const note = await loadFor(actor, id);
      return notes.update(note.id, pickEditable(patch));
    },

    async remove(actor, id) {
      const note = await loadFor(actor, id);
      await notes.delete(note.id);
    },
  };
}

export function createNotesHandler(service, authenticate) {
  const send = (res, status, body) => {
    if (body === undefined) {
      res.writeHead(status);
      res.end();
      return;
    }
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const readJson = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  };

  return async (req, res) => {
    try {
      const actor = await authenticate(req);
      if (!actor) return send(res, 401, { error: 'unauthorized' });

      const { pathname } = new URL(req.url, 'http://localhost');
      const one = pathname.match(/^\/notes\/([^/]+)$/);

      if (pathname === '/notes' && req.method === 'GET') return send(res, 200, await service.list(actor));
      if (pathname === '/notes' && req.method === 'POST') {
        return send(res, 201, await service.create(actor, await readJson(req)));
      }
      if (one && req.method === 'GET') return send(res, 200, await service.get(actor, one[1]));
      if (one && req.method === 'PATCH') {
        return send(res, 200, await service.update(actor, one[1], await readJson(req)));
      }
      if (one && req.method === 'DELETE') {
        await service.remove(actor, one[1]);
        return send(res, 204);
      }
      return send(res, 404, { error: 'not found' });
    } catch (error) {
      if (error instanceof NotFoundError) return send(res, 404, { error: 'not found' });
      return send(res, 500, { error: 'internal error' });
    }
  };
}
