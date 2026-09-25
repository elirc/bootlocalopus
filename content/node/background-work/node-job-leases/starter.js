export class LeaseLostError extends Error {
  constructor(jobId) {
    super(`lease on ${jobId} was lost`);
    // TODO: name and jobId
  }
}

export function createJobStore({ now = Date.now, leaseMs = 30_000 } = {}) {
  const jobs = new Map();
  let nextId = 1;

  // TODO: leases that expire, heartbeats, per-claim tokens, release delays.
  // This version marks a job 'running' forever: a crashed worker loses it.
  return {
    add(payload) {
      const id = `job_${nextId++}`;
      jobs.set(id, { id, payload, state: 'available', attempt: 0, owner: null });
      return id;
    },
    claim(workerId) {
      for (const job of jobs.values()) {
        if (job.state !== 'available') continue;
        job.state = 'leased';
        job.owner = workerId;
        job.attempt++;
        return { id: job.id, payload: job.payload, token: 'token', attempt: job.attempt };
      }
      return null;
    },
    heartbeat(id, token) {
      return now() + leaseMs;
    },
    complete(id, token) {
      jobs.get(id).state = 'done';
    },
    release(id, token, { delayMs = 0 } = {}) {
      jobs.get(id).state = 'available';
    },
    get(id) {
      return jobs.get(id);
    },
  };
}
