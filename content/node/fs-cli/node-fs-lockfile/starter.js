import { open, readFile, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export class LockedError extends Error {
  constructor(lockPath, holder) {
    super(`${lockPath} is held`);
    this.name = 'LockedError';
    this.holder = holder;
  }
}

export async function acquireLock(lockPath, { staleMs = 60000, now = Date.now, pid = process.pid } = {}) {
  // TODO: exclusive create ('wx'), stale takeover, and a release() that only
  // deletes a lock that is still ours.
  throw new Error('acquireLock is not implemented yet');
}

export async function withLock(lockPath, fn, options) {
  throw new Error('withLock is not implemented yet');
}
