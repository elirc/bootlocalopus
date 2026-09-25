import { randomUUID } from 'node:crypto';

export class LeaseLostError extends Error {
  constructor(jobId) {
    super(`lease on ${jobId} was lost`);
    this.name = 'LeaseLostError';
    this.jobId = jobId;
  }
}

export function createJobStore({ now = Date.now, leaseMs = 30_000 } = {}) {
  const jobs = new Map(); // insertion order == id order
  let nextId = 1;

  const leaseActive = (job) => job.lease !== null && now() < job.lease.expiresAt;

  /** The job, if `token` holds its current, unexpired lease; otherwise throw. */
  function holder(id, token) {
    const job = jobs.get(id);
    if (!job || job.done || !leaseActive(job) || job.lease.token !== token) throw new LeaseLostError(id);
    return job;
  }

  return {
    add(payload) {
      const id = `job_${nextId++}`;
      jobs.set(id, { id, payload, done: false, attempt: 0, lease: null, availableAt: -Infinity });
      return id;
    },

    claim(workerId) {
      const t = now();
      for (const job of jobs.values()) {
        if (job.done || leaseActive(job) || t < job.availableAt) continue;
        job.attempt++;
        // A fresh token per claim is what lets a zombie worker be told "not yours".
        job.lease = { token: randomUUID(), owner: workerId, expiresAt: t + leaseMs };
        return { id: job.id, payload: job.payload, token: job.lease.token, attempt: job.attempt };
      }
      return null;
    },

    heartbeat(id, token) {
      const job = holder(id, token);
      job.lease.expiresAt = now() + leaseMs;
      return job.lease.expiresAt;
    },

    complete(id, token) {
      const job = holder(id, token);
      job.done = true;
      job.lease = null;
    },

    release(id, token, { delayMs = 0 } = {}) {
      const job = holder(id, token);
      job.lease = null;
      job.availableAt = now() + delayMs;
    },

    get(id) {
      const job = jobs.get(id);
      if (!job) return undefined;
      const active = !job.done && leaseActive(job);
      return {
        id: job.id,
        payload: job.payload,
        state: job.done ? 'done' : active ? 'leased' : 'available',
        attempt: job.attempt,
        owner: active ? job.lease.owner : null,
      };
    },
  };
}
