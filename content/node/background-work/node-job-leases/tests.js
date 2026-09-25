const setup = (options = {}) => {
  const clock = { t: 5_000_000 };
  const store = solution.createJobStore({ now: () => clock.t, leaseMs: 1000, ...options });
  return { store, clock };
};

function lostOf(run) {
  try {
    run();
  } catch (e) {
    return e;
  }
  return fail('expected a LeaseLostError');
}

describe('claiming', () => {
  it('claims the oldest job, returns payload, token and attempt, and hides it', () => {
    const { store, clock } = setup();
    const a = store.add({ invoice: 812 });
    const b = store.add({ invoice: 813 });
    expect([a, b]).toEqual(['job_1', 'job_2']);
    const first = store.claim('w1');
    expect(first.id).toBe(a);
    expect(first.payload).toEqual({ invoice: 812 });
    expect(first.attempt).toBe(1);
    expect(typeof first.token).toBe('string');
    expect(store.get(a)).toStrictEqual({ id: a, payload: { invoice: 812 }, state: 'leased', attempt: 1, owner: 'w1' });
    expect(store.claim('w2').id).toBe(b);
    expect(store.claim('w3')).toBeNull();
    expect(store.get('job_404')).toBeUndefined();
  });

  it('makes a job claimable again once its lease expires (a crashed worker)', () => {
    const { store, clock } = setup();
    const id = store.add('x');
    const first = store.claim('w1');
    clock.t += 999;
    expect(store.claim('w2')).toBeNull();
    clock.t += 1;                          // now() >= expiresAt: expired
    expect(store.get(id)).toMatchObject({ state: 'available', owner: null });
    const second = store.claim('w2');
    expect(second.id).toBe(id);
    expect(second.attempt).toBe(2);
    expect(second.token).not.toBe(first.token);
    expect(store.get(id)).toMatchObject({ state: 'leased', owner: 'w2' });
  });

  it('prefers the oldest claimable job, whatever order leases expire in', () => {
    const { store, clock } = setup();
    const a = store.add('a');
    const b = store.add('b');
    store.claim('w1');                     // a, expires at +1000
    clock.t += 500;
    store.claim('w2');                     // b, expires at +1500
    clock.t += 1000;                       // both expired
    expect(store.claim('w3').id).toBe(a);
    expect(store.claim('w3').id).toBe(b);
  });

  it('gives every claim a distinct token', () => {
    const { store, clock } = setup();
    const tokens = new Set();
    for (let i = 0; i < 3; i++) store.add(i);
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 3; i++) tokens.add(store.claim('w').token);
      clock.t += 1000;
    }
    expect(tokens.size).toBe(9);
  });
});

describe('heartbeats', () => {
  it('extend the lease from now and return the new expiry', () => {
    const { store, clock } = setup();
    const id = store.add('x');
    const { token } = store.claim('w1');
    clock.t += 800;
    expect(store.heartbeat(id, token)).toBe(clock.t + 1000);
    clock.t += 800;                        // 1600 after the claim, 800 after the heartbeat
    expect(store.claim('w2')).toBeNull();
    expect(store.get(id).state).toBe('leased');
    clock.t += 200;
    expect(store.claim('w2')).not.toBeNull();
  });

  it('fail once the lease has expired, even if nobody re-claimed yet', () => {
    const { store, clock } = setup();
    const id = store.add('x');
    const { token } = store.claim('w1');
    clock.t += 1000;
    const err = lostOf(() => store.heartbeat(id, token));
    expect(err).toBeInstanceOf(solution.LeaseLostError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LeaseLostError');
    expect(err.jobId).toBe(id);
    expect(store.get(id).state).toBe('available');
  });
});

describe('zombie workers', () => {
  it('refuses a stale token and does not complete the job', () => {
    const { store, clock } = setup();
    const id = store.add('x');
    const a = store.claim('w1');
    clock.t += 1500;
    const b = store.claim('w2');
    expect(lostOf(() => store.complete(id, a.token))).toBeInstanceOf(solution.LeaseLostError);
    expect(lostOf(() => store.heartbeat(id, a.token))).toBeInstanceOf(solution.LeaseLostError);
    expect(lostOf(() => store.release(id, a.token))).toBeInstanceOf(solution.LeaseLostError);
    expect(store.get(id)).toMatchObject({ state: 'leased', owner: 'w2', attempt: 2 });
    store.complete(id, b.token);
    expect(store.get(id)).toMatchObject({ state: 'done', owner: null });
  });

  it('refuses to complete after expiry, leaving the job to be re-claimed', () => {
    const { store, clock } = setup();
    const id = store.add('x');
    const a = store.claim('w1');
    clock.t += 1000;
    expect(lostOf(() => store.complete(id, a.token))).toBeInstanceOf(solution.LeaseLostError);
    expect(store.claim('w2').id).toBe(id);
  });

  it('refuses unknown ids, wrong tokens, and anything on a done job', () => {
    const { store } = setup();
    const id = store.add('x');
    const { token } = store.claim('w1');
    expect(lostOf(() => store.complete('job_99', token)).jobId).toBe('job_99');
    expect(lostOf(() => store.complete(id, 'guess'))).toBeInstanceOf(solution.LeaseLostError);
    store.complete(id, token);
    expect(lostOf(() => store.complete(id, token))).toBeInstanceOf(solution.LeaseLostError);
    expect(lostOf(() => store.heartbeat(id, token))).toBeInstanceOf(solution.LeaseLostError);
    expect(store.claim('w2')).toBeNull();
  });
});

describe('release', () => {
  it('returns the job at once by default', () => {
    const { store } = setup();
    const id = store.add('x');
    const { token } = store.claim('w1');
    store.release(id, token);
    expect(store.get(id)).toMatchObject({ state: 'available', owner: null, attempt: 1 });
    expect(lostOf(() => store.heartbeat(id, token))).toBeInstanceOf(solution.LeaseLostError);
    const again = store.claim('w2');
    expect(again.id).toBe(id);
    expect(again.attempt).toBe(2);
  });

  it('holds the job back for delayMs, while younger jobs can still be claimed', () => {
    const { store, clock } = setup();
    const a = store.add('a');
    const b = store.add('b');
    const { token } = store.claim('w1');
    store.release(a, token, { delayMs: 5000 });
    expect(store.get(a).state).toBe('available');
    const second = store.claim('w2');
    expect(second.id).toBe(b);
    store.complete(b, second.token);
    clock.t += 4999;
    expect(store.claim('w3')).toBeNull();
    clock.t += 1;
    expect(store.claim('w3').id).toBe(a);
  });
});
