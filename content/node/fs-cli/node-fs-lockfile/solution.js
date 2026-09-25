import { open, readFile, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export class LockedError extends Error {
  constructor(lockPath, holder) {
    super(holder ? `${lockPath} is held by pid ${holder.pid}` : `${lockPath} is held`);
    this.name = 'LockedError';
    this.holder = holder;
  }
}

/** Exclusive create: true if we made the file, false if it already existed. */
async function tryCreate(lockPath, contents) {
  let handle;
  try {
    handle = await open(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
  try {
    await handle.writeFile(contents);
  } finally {
    await handle.close();
  }
  return true;
}

/** Who holds the lock and since when; falls back to mtime for unreadable content. */
async function inspect(lockPath) {
  const [text, info] = await Promise.all([readFile(lockPath, 'utf8'), stat(lockPath)]);
  try {
    const data = JSON.parse(text);
    if (data && typeof data.createdAt === 'number') {
      return { since: data.createdAt, holder: { pid: data.pid, createdAt: data.createdAt } };
    }
  } catch {
    // empty or half-written: judge it by the file's age instead
  }
  return { since: info.mtimeMs, holder: null };
}

export async function acquireLock(lockPath, { staleMs = 60000, now = Date.now, pid = process.pid } = {}) {
  const token = randomUUID();
  const contents = JSON.stringify({ pid, createdAt: now(), token });

  if (!(await tryCreate(lockPath, contents))) {
    let current;
    try {
      current = await inspect(lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      current = null; // released between our create and our read
    }
    if (current && now() - current.since <= staleMs) {
      throw new LockedError(lockPath, current.holder);
    }
    if (current) await rm(lockPath, { force: true });
    if (!(await tryCreate(lockPath, contents))) {
      const winner = await inspect(lockPath).catch(() => ({ holder: null }));
      throw new LockedError(lockPath, winner.holder);
    }
  }

  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      let text;
      try {
        text = await readFile(lockPath, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
      }
      let owner;
      try {
        owner = JSON.parse(text).token;
      } catch {
        return; // not a lock we wrote
      }
      if (owner === token) await rm(lockPath, { force: true });
    },
  };
}

export async function withLock(lockPath, fn, options) {
  const lock = await acquireLock(lockPath, options);
  try {
    return await fn();
  } finally {
    await lock.release();
  }
}
