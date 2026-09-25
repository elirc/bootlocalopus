// node-db: one shared database, no per-test transaction. Every test starts
// from the same three documents at version 1.
async function reset() {
  await db.exec(`
    truncate documents restart identity;
    insert into documents (title, body) values
      ('Onboarding', 'Day 1: laptop.'),
      ('Runbook', 'Restart the worker.'),
      ('Roadmap', 'Q1: search.');
  `);
}
beforeEach(reset);

const isDocUpdate = (text) => /^\s*update\s+documents\b/i.test(text);

/**
 * A connection with only `query`. `beforeUpdate(n)` runs just before the
 * n-th UPDATE of documents is forwarded: that is where the other editor's
 * save lands.
 */
function spyConn(beforeUpdate) {
  const calls = [];
  let updates = 0;
  const conn = {
    async query(text, params) {
      calls.push({ text: String(text), params: Array.isArray(params) ? [...params] : [] });
      if (isDocUpdate(String(text))) {
        updates += 1;
        if (beforeUpdate) await beforeUpdate(updates);
      }
      return db.query(text, params);
    },
  };
  return { conn, calls };
}

/** The other editor: appends to the body and bumps the version, committed. */
async function otherEditorSaves(id, note = ' [edited elsewhere]') {
  await db.query('update documents set body = body || $1, version = version + 1 where id = $2', [note, id]);
}

async function row(id) {
  const rows = await q('select id, title, body, version from documents where id = $1', [id]);
  return rows[0] ?? null;
}

async function rejectionOf(run) {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return fail('expected a rejection, but it resolved');
}

describe('getDocument', () => {
  it('returns { id, title, body, version }', async () => {
    const doc = await solution.getDocument(spyConn().conn, 2);
    expect(doc).toStrictEqual({ id: 2, title: 'Runbook', body: 'Restart the worker.', version: 1 });
  });

  it('returns null for a missing id', async () => {
    expect(await solution.getDocument(spyConn().conn, 999)).toBeNull();
  });
});

describe('saveDocument', () => {
  it('saves at the expected version and returns the new version', async () => {
    const saved = await solution.saveDocument(spyConn().conn,
      { id: 2, expectedVersion: 1, title: 'Runbook v2', body: 'Restart the worker. Then check the queue.' });
    expect(saved).toStrictEqual({ id: 2, title: 'Runbook v2', body: 'Restart the worker. Then check the queue.', version: 2 });
    expect(await row(2)).toStrictEqual(saved);
    const again = await solution.saveDocument(spyConn().conn, { id: 2, expectedVersion: 2, title: 'Runbook v3', body: 'x' });
    expect(again.version).toBe(3);
  });

  it('refuses a stale version with VersionConflictError, and changes nothing', async () => {
    await otherEditorSaves(1);
    await otherEditorSaves(1);
    const err = await rejectionOf(() => solution.saveDocument(spyConn().conn,
      { id: 1, expectedVersion: 1, title: 'Mine', body: 'Mine' }));
    expect(err).toBeInstanceOf(solution.VersionConflictError);
    expect(err.id).toBe(1);
    expect(err.expectedVersion).toBe(1);
    expect(err.currentVersion).toBe(3);
    expect(await row(1)).toStrictEqual({ id: 1, title: 'Onboarding', body: 'Day 1: laptop. [edited elsewhere] [edited elsewhere]', version: 3 });
  });

  it('notices a save that lands after your read and before your UPDATE', async () => {
    // Read the version first, as a form would, then save through a connection
    // where the other editor commits just before the UPDATE arrives.
    const read = await solution.getDocument(spyConn().conn, 3);
    const { conn } = spyConn(async (n) => { if (n === 1) await otherEditorSaves(3); });
    const err = await rejectionOf(() => solution.saveDocument(conn,
      { id: 3, expectedVersion: read.version, title: 'Roadmap', body: 'Q1: search. Q2: billing.' }));
    assert(err instanceof solution.VersionConflictError,
      `expected VersionConflictError, got ${err && err.name}: ${err && err.message}`);
    expect(err.currentVersion).toBe(2);
    expect((await row(3)).body).toBe('Q1: search. [edited elsewhere]');
  });

  it('throws DocumentNotFoundError for a missing row', async () => {
    const err = await rejectionOf(() => solution.saveDocument(spyConn().conn,
      { id: 404, expectedVersion: 1, title: 't', body: 'b' }));
    expect(err).toBeInstanceOf(solution.DocumentNotFoundError);
    expect(err.id).toBe(404);
  });

  it('rejects a bad expectedVersion with a RangeError before any query', async () => {
    for (const expectedVersion of [0, -1, 1.5, '1', undefined, null, Number.NaN, 2 ** 53]) {
      const { conn, calls } = spyConn();
      const err = await rejectionOf(() => solution.saveDocument(conn, { id: 1, expectedVersion, title: 't', body: 'b' }));
      assert(err instanceof RangeError, `expectedVersion ${String(expectedVersion)}: expected RangeError, got ${err && err.name}`);
      expect(calls).toHaveLength(0);
    }
    expect((await row(1)).version).toBe(1);
  });
});

describe('updateWithRetry', () => {
  const appendLine = (line) => (doc) => ({ title: doc.title, body: `${doc.body}\n${line}` });

  it('applies the change once when nobody interferes', async () => {
    let calls = 0;
    const saved = await solution.updateWithRetry(spyConn().conn, 2, (doc) => { calls += 1; return appendLine('Check the queue.')(doc); });
    expect(calls).toBe(1);
    expect(saved).toStrictEqual({ id: 2, title: 'Runbook', body: 'Restart the worker.\nCheck the queue.', version: 2 });
  });

  it('re-reads and re-applies after a conflict, keeping both edits', async () => {
    const seen = [];
    const { conn } = spyConn(async (n) => { if (n === 1) await otherEditorSaves(2, '\nPage the on-call.'); });
    const saved = await solution.updateWithRetry(conn, 2, (doc) => {
      seen.push({ ...doc });
      return appendLine('Check the queue.')(doc);
    });
    expect(seen).toHaveLength(2);
    expect(seen[0].version).toBe(1);
    // The second call must see the other editor's change, not the old copy.
    expect(seen[1]).toStrictEqual({ id: 2, title: 'Runbook', body: 'Restart the worker.\nPage the on-call.', version: 2 });
    expect(saved.body).toBe('Restart the worker.\nPage the on-call.\nCheck the queue.');
    expect(saved.version).toBe(3);
    expect(await row(2)).toStrictEqual(saved);
  });

  it('gives up after maxAttempts and rethrows the conflict', async () => {
    let calls = 0;
    const { conn } = spyConn(() => otherEditorSaves(1, '!'));
    const err = await rejectionOf(() => solution.updateWithRetry(conn, 1, (doc) => { calls += 1; return appendLine('x')(doc); }));
    expect(err).toBeInstanceOf(solution.VersionConflictError);
    expect(calls).toBe(3);
    expect((await row(1)).body).toBe('Day 1: laptop.!!!');

    calls = 0;
    const err5 = await rejectionOf(() => solution.updateWithRetry(conn, 1, (doc) => { calls += 1; return appendLine('x')(doc); }, { maxAttempts: 5 }));
    expect(err5).toBeInstanceOf(solution.VersionConflictError);
    expect(calls).toBe(5);
  });

  it('throws DocumentNotFoundError without calling mutate', async () => {
    let calls = 0;
    const err = await rejectionOf(() => solution.updateWithRetry(spyConn().conn, 77, () => { calls += 1; return { title: 't', body: 'b' }; }));
    expect(err).toBeInstanceOf(solution.DocumentNotFoundError);
    expect(calls).toBe(0);
  });

  it('does not retry when mutate itself throws', async () => {
    let calls = 0;
    const boom = new Error('validation failed');
    const err = await rejectionOf(() => solution.updateWithRetry(spyConn().conn, 1, () => { calls += 1; throw boom; }));
    expect(err).toBe(boom);
    expect(calls).toBe(1);
    expect((await row(1)).version).toBe(1);
  });
});
