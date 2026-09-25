import { access, mkdtemp, rm, writeFile, readFile, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * os.tmpdir() reads TEMP/TMP; a grading sandbox with a bare environment on
 * Windows has neither, so fall back to this run's own scratch folder.
 */
const tmpBase = async () => {
  try { await access(os.tmpdir()); return os.tmpdir(); } catch { return path.dirname(fileURLToPath(import.meta.url)); }
};

const withDir = async (fn) => {
  const dir = await mkdtemp(path.join(await tmpBase(), 'lock-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const exists = (p) => access(p).then(() => true, () => false);
const readLock = async (p) => JSON.parse(await readFile(p, 'utf8'));
const clock = (t) => () => t;

describe('acquireLock', () => {
  it('creates the lock file with pid, createdAt and a token', () => withDir(async (dir) => {
    const p = path.join(dir, 'job.lock');
    const lock = await solution.acquireLock(p, { now: clock(1000), pid: 4242 });
    const data = await readLock(p);
    expect(data.pid).toBe(4242);
    expect(data.createdAt).toBe(1000);
    expect(typeof data.token).toBe('string');
    expect(data.token.length).toBeGreaterThan(0);
    expect(typeof lock.release).toBe('function');
    await lock.release();
  }));

  it('rejects a second acquire with a LockedError naming the holder', () => withDir(async (dir) => {
    const p = path.join(dir, 'job.lock');
    const first = await solution.acquireLock(p, { now: clock(5000), pid: 11 });
    let caught;
    try {
      await solution.acquireLock(p, { now: clock(6000), pid: 22, staleMs: 60000 });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(solution.LockedError);
    expect(caught).toBeInstanceOf(Error);
    expect(caught.name).toBe('LockedError');
    expect(caught.holder).toEqual({ pid: 11, createdAt: 5000 });
    expect((await readLock(p)).pid).toBe(11);
    await first.release();
  }));

  it('lets exactly one of many simultaneous callers win', () => withDir(async (dir) => {
    const p = path.join(dir, 'job.lock');
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => solution.acquireLock(p, { pid: 100 + i })),
    );
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(7);
    for (const r of lost) expect(r.reason.name).toBe('LockedError');
    await won[0].value.release();
  }));

  it('release deletes the lock so it can be taken again', () => withDir(async (dir) => {
    const p = path.join(dir, 'job.lock');
    const a = await solution.acquireLock(p);
    await a.release();
    expect(await exists(p)).toBe(false);
    const b = await solution.acquireLock(p);
    expect(await exists(p)).toBe(true);
    await b.release();
    await b.release(); // twice is a no-op
    expect(await exists(p)).toBe(false);
  }));

  it('takes over a lock older than staleMs, but not one exactly staleMs old', () => withDir(async (dir) => {
    const p = path.join(dir, 'job.lock');
    await writeFile(p, JSON.stringify({ pid: 1, createdAt: 10000, token: 'old' }));
    await expect(solution.acquireLock(p, { now: clock(15000), staleMs: 5000, pid: 2 }))
      .rejects.toThrow();
    expect((await readLock(p)).pid).toBe(1);
    const lock = await solution.acquireLock(p, { now: clock(15001), staleMs: 5000, pid: 2 });
    const data = await readLock(p);
    expect(data.pid).toBe(2);
    expect(data.createdAt).toBe(15001);
    await lock.release();
  }));

  it('judges an unreadable lock file by its mtime, with holder null', () => withDir(async (dir) => {
    const p = path.join(dir, 'job.lock');
    await writeFile(p, '');
    const mtime = 1_700_000_000; // seconds
    await utimes(p, mtime, mtime);
    let caught;
    try {
      await solution.acquireLock(p, { now: clock(mtime * 1000 + 1000), staleMs: 60000 });
    } catch (e) {
      caught = e;
    }
    expect(caught && caught.name).toBe('LockedError');
    expect(caught.holder).toBeNull();

    await writeFile(p, '{"pid": 7, "creat');
    await utimes(p, mtime, mtime);
    const lock = await solution.acquireLock(p, { now: clock(mtime * 1000 + 61000), staleMs: 60000, pid: 8 });
    expect((await readLock(p)).pid).toBe(8);
    await lock.release();
  }));

  it('does not delete a lock that a later run took over', () => withDir(async (dir) => {
    const p = path.join(dir, 'job.lock');
    const slow = await solution.acquireLock(p, { now: clock(0), staleMs: 1000, pid: 1 });
    const next = await solution.acquireLock(p, { now: clock(5000), staleMs: 1000, pid: 2 });
    await slow.release();
    expect(await exists(p)).toBe(true);
    expect((await readLock(p)).pid).toBe(2);
    await next.release();
    expect(await exists(p)).toBe(false);
  }));

  it('passes other errors through instead of calling them LockedError', () => withDir(async (dir) => {
    const p = path.join(dir, 'no-such-dir', 'job.lock');
    let caught;
    try {
      await solution.acquireLock(p);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.code).toBe('ENOENT');
    expect(caught instanceof solution.LockedError).toBe(false);
  }));
});

describe('withLock', () => {
  it('returns the function\'s result and releases the lock', () => withDir(async (dir) => {
    const p = path.join(dir, 'job.lock');
    let heldInside = false;
    const result = await solution.withLock(p, async () => {
      heldInside = await exists(p);
      return 42;
    });
    expect(result).toBe(42);
    expect(heldInside).toBe(true);
    expect(await exists(p)).toBe(false);
  }));

  it('releases the lock when the function throws, and rethrows', () => withDir(async (dir) => {
    const p = path.join(dir, 'job.lock');
    await expect(solution.withLock(p, async () => { throw new Error('export failed'); }))
      .rejects.toThrow('export failed');
    expect(await exists(p)).toBe(false);
  }));

  it('does not run the function when the lock is held', () => withDir(async (dir) => {
    const p = path.join(dir, 'job.lock');
    const held = await solution.acquireLock(p);
    let ran = false;
    await expect(solution.withLock(p, async () => { ran = true; })).rejects.toThrow();
    expect(ran).toBe(false);
    expect(await exists(p)).toBe(true);
    await held.release();
  }));
});
