const MIN = 60_000;
const HOUR = 60 * MIN;

const setup = (opts = {}) => {
  const clock = { t: 1_700_000_000_000 };
  const store = solution.createSessionStore({ now: () => clock.t, ...opts });
  return { store, clock };
};

describe('ids', () => {
  it('are long, random and base64url', () => {
    const { store } = setup();
    const ids = new Set();
    for (let i = 0; i < 200; i++) {
      const sid = store.create('u' + (i % 3));
      expect(typeof sid).toBe('string');
      expect(sid).toMatch(/^[A-Za-z0-9_-]{22,}$/);
      ids.add(sid);
    }
    expect(ids.size).toBe(200);
  });
});

describe('get', () => {
  it('returns the session and records activity', () => {
    const { store, clock } = setup();
    const t0 = clock.t;
    const sid = store.create('alice', { role: 'user' });
    clock.t += 5 * MIN;
    const s = store.get(sid);
    expect(s).toEqual({ userId: 'alice', data: { role: 'user' }, createdAt: t0, lastSeenAt: t0 + 5 * MIN });
  });

  it('treats non-ids and prototype keys as unknown', () => {
    const { store } = setup();
    store.create('alice');
    for (const sid of [undefined, null, '', 42, '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(store.get(sid)).toBeNull();
      expect(store.rotate(sid)).toBeNull();
      expect(store.destroy(sid)).toBe(false);
    }
  });

  it('expires after the idle timeout, exactly at the boundary', () => {
    const { store, clock } = setup({ idleMs: 30 * MIN });
    const sid = store.create('alice');
    clock.t += 30 * MIN - 1;
    expect(store.get(sid)).not.toBeNull();
    clock.t += 30 * MIN;
    expect(store.get(sid)).toBeNull();
    // Dead stays dead, even if time could somehow be rewound.
    clock.t -= 30 * MIN;
    expect(store.get(sid)).toBeNull();
  });

  it('slides the idle window on each get', () => {
    const { store, clock } = setup({ idleMs: 30 * MIN });
    const sid = store.create('alice');
    for (let i = 0; i < 5; i++) {
      clock.t += 20 * MIN;
      expect(store.get(sid)).not.toBeNull();
    }
  });

  it('enforces the absolute timeout however active the session is', () => {
    const { store, clock } = setup({ idleMs: 30 * MIN, absoluteMs: 2 * HOUR });
    const sid = store.create('alice');
    let alive = 0;
    for (let i = 1; i <= 20; i++) {
      clock.t += 10 * MIN;
      if (store.get(sid)) alive++;
    }
    expect(alive).toBe(11); // 10, 20, … 110 minutes; dead at 120
  });
});

describe('rotate', () => {
  it('moves the session to a new id and kills the old one', () => {
    const { store, clock } = setup();
    const t0 = clock.t;
    const old = store.create('alice', { org: 'acme' });
    clock.t += MIN;
    const next = store.rotate(old);
    expect(next).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(next).not.toBe(old);
    expect(store.get(old)).toBeNull();
    expect(store.get(next)).toEqual({ userId: 'alice', data: { org: 'acme' }, createdAt: t0, lastSeenAt: t0 + MIN });
    expect(store.countForUser('alice')).toBe(1);
    expect(store.destroy(old)).toBe(false);
  });

  it('keeps createdAt, so rotating cannot extend the absolute timeout', () => {
    const { store, clock } = setup({ idleMs: 30 * MIN, absoluteMs: HOUR });
    let sid = store.create('alice');
    for (let i = 0; i < 5; i++) {
      clock.t += 11 * MIN;
      sid = store.rotate(sid);
      expect(sid).not.toBeNull();
    }
    clock.t += 5 * MIN; // 60 minutes after login
    expect(store.get(sid)).toBeNull();
    expect(store.rotate(sid)).toBeNull();
  });

  it('refuses to rotate an idle-expired session', () => {
    const { store, clock } = setup({ idleMs: 10 * MIN });
    const sid = store.create('alice');
    clock.t += 10 * MIN;
    expect(store.rotate(sid)).toBeNull();
  });
});

describe('destroy and destroyAllForUser', () => {
  it('destroy reports whether it removed a live session', () => {
    const { store } = setup();
    const sid = store.create('alice');
    expect(store.destroy(sid)).toBe(true);
    expect(store.destroy(sid)).toBe(false);
    expect(store.get(sid)).toBeNull();
  });

  it('logs a user out everywhere except the current session', () => {
    const { store } = setup();
    const a1 = store.create('alice');
    const a2 = store.create('alice');
    const a3 = store.create('alice');
    const b1 = store.create('bob');
    expect(store.countForUser('alice')).toBe(3);
    expect(store.destroyAllForUser('alice', { except: a2 })).toBe(2);
    expect(store.get(a1)).toBeNull();
    expect(store.get(a3)).toBeNull();
    expect(store.get(a2)).not.toBeNull();
    expect(store.get(b1)).not.toBeNull();
    expect(store.countForUser('alice')).toBe(1);
    expect(store.destroyAllForUser('alice')).toBe(1);
    expect(store.countForUser('alice')).toBe(0);
    expect(store.destroyAllForUser('nobody')).toBe(0);
  });

  it('follows rotated ids and ignores already-dead sessions', () => {
    const { store, clock } = setup({ idleMs: 10 * MIN });
    const stale = store.create('alice');
    clock.t += 6 * MIN;
    let current = store.create('alice');
    current = store.rotate(current);
    const other = store.rotate(store.create('alice'));
    clock.t += 5 * MIN; // `stale` is now idle-expired
    expect(store.countForUser('alice')).toBe(2);
    expect(store.destroyAllForUser('alice', { except: current })).toBe(1);
    expect(store.get(other)).toBeNull();
    expect(store.get(current)).not.toBeNull();
    expect(store.get(stale)).toBeNull();
  });

  it('does not count or destroy by a user id that merely looks similar', () => {
    const { store } = setup();
    store.create('1');
    store.create(1);
    expect(store.countForUser('1')).toBe(1);
    expect(store.destroyAllForUser(1)).toBe(1);
    expect(store.countForUser('1')).toBe(1);
  });
});

describe('sweep', () => {
  it('deletes only the expired sessions and returns the count', () => {
    const { store, clock } = setup({ idleMs: 10 * MIN, absoluteMs: HOUR });
    const old = store.create('alice');
    const busy = store.create('bob');
    clock.t += 8 * MIN;
    const fresh = store.create('carol');
    store.get(busy);
    clock.t += 3 * MIN; // old: idle 11 min; busy: idle 3; fresh: 3
    expect(store.sweep()).toBe(1);
    expect(store.sweep()).toBe(0);
    expect(store.get(old)).toBeNull();
    expect(store.get(busy)).not.toBeNull();
    expect(store.get(fresh)).not.toBeNull();
    expect(store.countForUser('alice')).toBe(0);
  });
});
