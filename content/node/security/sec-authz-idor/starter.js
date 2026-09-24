export class NotFoundError extends Error {
  constructor(message = 'note not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Data access only. It stores what it is given and knows nothing about owners. (Given; correct.) */
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

// This service works, and it is wide open. Fix it.
export function createNoteService({ notes }) {
  return {
    async create(actor, input) {
      return notes.insert({ ownerId: actor.id, ...input });
    },

    async get(actor, id) {
      const note = await notes.findById(id);
      if (!note) throw new NotFoundError('note not found');
      return note;
    },

    async list(actor) {
      return notes.all();
    },

    async update(actor, id, patch) {
      const note = await notes.findById(id);
      if (!note) throw new NotFoundError('note not found');
      return notes.update(id, patch);
    },

    async remove(actor, id) {
      const note = await notes.findById(id);
      if (!note) throw new NotFoundError('note not found');
      await notes.delete(id);
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
      // TODO: no actor -> 401

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
      // TODO: a NotFoundError is a 404, not a 500
      return send(res, 500, { error: 'internal error' });
    }
  };
}
