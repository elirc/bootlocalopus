import http from 'node:http';

const merge = (t, p) => solution.applyMergePatch(t, p);
const clone = (v) => JSON.parse(JSON.stringify(v));

describe('applyMergePatch', () => {
  it('handles the example from the brief', () => {
    const target = { a: 1, s: { x: 1, y: 2 }, tags: ['a', 'b'] };
    const patch = { a: null, s: { y: 3, z: { k: null, v: 1 } }, tags: ['c'] };
    expect(merge(target, patch)).toStrictEqual({ s: { x: 1, y: 3, z: { v: 1 } }, tags: ['c'] });
  });

  it('merges nested objects instead of replacing them', () => {
    const profile = { name: 'Ada', settings: { theme: 'light', language: 'en', email: { weekly: true, daily: false } } };
    expect(merge(profile, { settings: { theme: 'dark', email: { daily: true } } })).toStrictEqual({
      name: 'Ada',
      settings: { theme: 'dark', language: 'en', email: { weekly: true, daily: true } },
    });
  });

  it('deletes keys whose patch value is null, at any depth', () => {
    expect(merge({ a: 1, b: { c: 2, d: 3 } }, { a: null, b: { c: null } })).toStrictEqual({ b: { d: 3 } });
    expect(merge({ a: 1 }, { missing: null })).toStrictEqual({ a: 1 });
  });

  it('replaces arrays and primitives wholesale', () => {
    expect(merge({ tags: [{ id: 1, x: 1 }, { id: 2 }] }, { tags: [{ id: 1 }] })).toStrictEqual({ tags: [{ id: 1 }] });
    expect(merge({ a: { b: 1 } }, { a: 'flat' })).toStrictEqual({ a: 'flat' });
    expect(merge({ a: 'flat' }, { a: { b: 1 } })).toStrictEqual({ a: { b: 1 } });
    expect(merge({ a: [1] }, { a: { b: null, c: 1 } })).toStrictEqual({ a: { c: 1 } });
    expect(merge({ n: 0, f: true }, { n: 0, f: false, s: '' })).toStrictEqual({ n: 0, f: false, s: '' });
  });

  it('returns a non-object patch itself, and merges an object patch into {} for a non-object target', () => {
    expect(merge({ a: 1 }, [1, 2])).toStrictEqual([1, 2]);
    expect(merge({ a: 1 }, 'x')).toBe('x');
    expect(merge({ a: 1 }, null)).toBeNull();
    expect(merge([1, 2], { a: 1, b: null })).toStrictEqual({ a: 1 });
    expect(merge('str', { a: { b: null } })).toStrictEqual({ a: {} });
  });

  it('never mutates the target or the patch', () => {
    const target = { a: 1, s: { x: 1, deep: { y: 1 } }, keep: { k: 1 } };
    const patch = { a: null, s: { x: 2, deep: { y: null, z: { w: null, q: 1 } } } };
    const t0 = clone(target);
    const p0 = clone(patch);
    const result = merge(target, patch);
    expect(target).toStrictEqual(t0);
    expect(patch).toStrictEqual(p0);
    expect(result.s).not.toBe(target.s);
    expect(result.s.deep).not.toBe(target.s.deep);
    result.s.x = 99;
    expect(target.s.x).toBe(1);
  });
});

/** A small in-memory profile store behind createPatchHandler. */
async function start(options = {}) {
  const store = new Map([['7', { id: '7', name: 'Ada', createdAt: '2024-01-01', settings: { theme: 'light', language: 'en' } }]]);
  const saves = [];
  const handler = solution.createPatchHandler({
    load: async (id) => store.get(id),
    save: async (id, next) => { saves.push([id, next]); store.set(id, next); },
    readonly: ['id', 'createdAt'],
    ...options,
  });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const patch = async (path, body, contentType = 'application/merge-patch+json') => {
    const res = await fetch(base + path, {
      method: 'PATCH',
      headers: contentType ? { 'content-type': contentType } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, json: await res.json() };
  };
  return { patch, store, saves, close: () => new Promise((r) => server.close(r)) };
}

describe('createPatchHandler', () => {
  it('merges, saves and answers 200 with the new resource', async () => {
    const app = await start();
    try {
      const before = app.store.get('7');
      const r = await app.patch('/profiles/7', { settings: { theme: 'dark' }, nickname: 'countess' });
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toMatch(/application\/json/);
      const expected = { id: '7', name: 'Ada', createdAt: '2024-01-01', settings: { theme: 'dark', language: 'en' }, nickname: 'countess' };
      expect(r.json).toStrictEqual({ data: expected });
      expect(app.saves).toHaveLength(1);
      expect(app.saves[0]).toStrictEqual(['7', expected]);
      expect(before.settings.theme).toBe('light');
      expect(before.nickname).toBeUndefined();

      const cleared = await app.patch('/profiles/7?fields=all', { nickname: null });
      expect(cleared.status).toBe(200);
      expect('nickname' in cleared.json.data).toBe(false);
      expect(app.store.get('7')).toStrictEqual(cleared.json.data);
    } finally { await app.close(); }
  });

  it('accepts media type parameters and any case, but nothing else (415)', async () => {
    const app = await start();
    try {
      expect((await app.patch('/profiles/7', { name: 'A' }, 'Application/Merge-Patch+JSON; charset=utf-8')).status).toBe(200);
      for (const type of ['application/json', 'application/json-patch+json', 'text/plain', null]) {
        const r = await app.patch('/profiles/7', { name: 'B' }, type);
        expect(r.status).toBe(415);
        expect(r.json.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      }
      expect(app.saves).toHaveLength(1);
    } finally { await app.close(); }
  });

  it('answers 400 for broken JSON and for a patch that is not an object', async () => {
    const app = await start();
    try {
      const broken = await app.patch('/profiles/7', '{"name":');
      expect(broken.status).toBe(400);
      expect(broken.json.error.code).toBe('INVALID_JSON');
      for (const body of ['[]', '"x"', 'null', '3']) {
        const r = await app.patch('/profiles/7', body);
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('INVALID_PATCH');
      }
      expect(app.saves).toHaveLength(0);
    } finally { await app.close(); }
  });

  it('answers 404 for an unknown id', async () => {
    const app = await start();
    try {
      const r = await app.patch('/profiles/8', { name: 'x' });
      expect(r.status).toBe(404);
      expect(r.json.error.code).toBe('NOT_FOUND');
    } finally { await app.close(); }
  });

  it('refuses readonly fields in any form, listing them in patch order', async () => {
    const app = await start();
    try {
      const r = await app.patch('/profiles/7', { name: 'Grace', createdAt: null, id: '7' });
      expect(r.status).toBe(422);
      expect(r.json.error.code).toBe('READONLY_FIELD');
      expect(r.json.error.details).toStrictEqual({ fields: ['createdAt', 'id'] });
      expect(app.saves).toHaveLength(0);
      expect(app.store.get('7').name).toBe('Ada');
    } finally { await app.close(); }
  });

  it('validates the merged result and leaves the stored object untouched on failure', async () => {
    const validate = (p) => (typeof p.name === 'string' && p.name.length > 0 ? null : { name: 'is required' });
    const app = await start({ validate });
    try {
      const stored = app.store.get('7');
      const r = await app.patch('/profiles/7', { name: null, settings: { theme: 'dark' } });
      expect(r.status).toBe(422);
      expect(r.json.error.code).toBe('VALIDATION_FAILED');
      expect(r.json.error.details).toStrictEqual({ name: 'is required' });
      expect(app.saves).toHaveLength(0);
      expect(app.store.get('7')).toBe(stored);
      expect(stored).toStrictEqual({ id: '7', name: 'Ada', createdAt: '2024-01-01', settings: { theme: 'light', language: 'en' } });
    } finally { await app.close(); }
  });

  it('passes the merged result, not the patch, to validate', async () => {
    const seen = [];
    const app = await start({ validate: (p) => { seen.push(p); return null; } });
    try {
      await app.patch('/profiles/7', { settings: { language: 'fr' } });
      expect(seen).toStrictEqual([{ id: '7', name: 'Ada', createdAt: '2024-01-01', settings: { theme: 'light', language: 'fr' } }]);
    } finally { await app.close(); }
  });
});
