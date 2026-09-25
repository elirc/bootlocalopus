const MB = 1_048_576;
// 2024-03-10T23:50:00Z
const LATE = Date.UTC(2024, 2, 10, 23, 50);

const setup = (opts = {}) => {
  const clock = { t: Date.UTC(2024, 2, 10, 12, 0) };
  const limits = solution.createUserLimits({ now: () => clock.t, ...opts });
  return { limits, clock };
};

const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    return e instanceof solution.LimitError ? e.code : 'not a LimitError: ' + (e && e.message);
  }
  return 'did not throw';
};

describe('LimitError', () => {
  it('carries its code', () => {
    const e = new solution.LimitError('quota-exceeded');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('LimitError');
    expect(e.code).toBe('quota-exceeded');
    expect(e.message).toBe('quota-exceeded');
  });
});

describe('in-flight slots', () => {
  it('allows maxInFlight at once and frees a slot on release', () => {
    const { limits } = setup({ maxInFlight: 2 });
    const r1 = limits.acquire('u1', 10);
    limits.acquire('u1', 10);
    expect(codeOf(() => limits.acquire('u1', 10))).toBe('too-many-in-flight');
    expect(typeof r1).toBe('function');
    expect(r1()).toBe(true);
    expect(codeOf(() => limits.acquire('u1', 10))).toBe('did not throw');
  });

  it('releases only once, however many times it is called', () => {
    const { limits } = setup({ maxInFlight: 2 });
    const r1 = limits.acquire('u1', 10);
    limits.acquire('u1', 10);
    expect(r1()).toBe(true);
    expect(r1()).toBe(false);
    expect(r1(false)).toBe(false);
    limits.acquire('u1', 10);
    expect(codeOf(() => limits.acquire('u1', 10))).toBe('too-many-in-flight');
    expect(limits.usage('u1').inFlight).toBe(2);
    expect(limits.usage('u1').usedToday).toBe(10);
  });

  it('keeps users independent', () => {
    const { limits } = setup({ maxInFlight: 1 });
    limits.acquire('u1', 1);
    expect(codeOf(() => limits.acquire('u2', 1))).toBe('did not throw');
    expect(codeOf(() => limits.acquire('u1', 1))).toBe('too-many-in-flight');
  });

  it('reports the slot limit before the quota', () => {
    const { limits } = setup({ maxInFlight: 1, bytesPerDay: 10 });
    limits.acquire('u1', 5);
    expect(codeOf(() => limits.acquire('u1', 50))).toBe('too-many-in-flight');
  });
});

describe('daily quota', () => {
  it('counts reserved bytes, so concurrent uploads cannot overshoot', () => {
    const { limits } = setup({ maxInFlight: 10, bytesPerDay: 100 * MB });
    limits.acquire('u1', 90 * MB)();
    limits.acquire('u1', 6 * MB);
    expect(codeOf(() => limits.acquire('u1', 6 * MB))).toBe('quota-exceeded');
    expect(codeOf(() => limits.acquire('u1', 4 * MB))).toBe('did not throw');
    expect(limits.usage('u1')).toEqual({ inFlight: 2, reserved: 10 * MB, usedToday: 90 * MB, remaining: 0 });
  });

  it('allows exactly the quota', () => {
    const { limits } = setup({ bytesPerDay: 100 });
    limits.acquire('u1', 60)();
    expect(codeOf(() => limits.acquire('u1', 41))).toBe('quota-exceeded');
    expect(codeOf(() => limits.acquire('u1', 40))).toBe('did not throw');
  });

  it('refunds a failed upload and charges a successful one', () => {
    const { limits } = setup({ bytesPerDay: 100 });
    const failed = limits.acquire('u1', 70);
    expect(limits.usage('u1')).toEqual({ inFlight: 1, reserved: 70, usedToday: 0, remaining: 30 });
    failed(false);
    expect(limits.usage('u1')).toEqual({ inFlight: 0, reserved: 0, usedToday: 0, remaining: 100 });
    const ok = limits.acquire('u1', 70);
    ok();
    expect(limits.usage('u1')).toEqual({ inFlight: 0, reserved: 0, usedToday: 70, remaining: 30 });
  });

  it('rejects sizes that are not non-negative safe integers', () => {
    const { limits } = setup();
    for (const bytes of [-1, 1.5, NaN, Infinity, '10', undefined, null, 2 ** 53]) {
      expect(codeOf(() => limits.acquire('u1', bytes))).toBe('invalid-size');
    }
    expect(limits.usage('u1').inFlight).toBe(0);
    expect(codeOf(() => limits.acquire('u1', 0))).toBe('did not throw');
  });

  it('knows nothing about unknown users', () => {
    const { limits } = setup({ bytesPerDay: 500 });
    expect(limits.usage('ghost')).toEqual({ inFlight: 0, reserved: 0, usedToday: 0, remaining: 500 });
  });
});

describe('days', () => {
  it('starts again at UTC midnight', () => {
    const { limits, clock } = setup({ bytesPerDay: 100 });
    clock.t = LATE;
    limits.acquire('u1', 100)();
    expect(codeOf(() => limits.acquire('u1', 1))).toBe('quota-exceeded');
    clock.t = Date.UTC(2024, 2, 10, 23, 59, 59, 999);
    expect(codeOf(() => limits.acquire('u1', 1))).toBe('quota-exceeded');
    clock.t = Date.UTC(2024, 2, 11, 0, 0);
    expect(limits.usage('u1').usedToday).toBe(0);
    expect(codeOf(() => limits.acquire('u1', 100))).toBe('did not throw');
  });

  it('charges an upload to the day it started', () => {
    const { limits, clock } = setup({ bytesPerDay: 100 });
    clock.t = LATE;
    const release = limits.acquire('u1', 80);
    clock.t = Date.UTC(2024, 2, 11, 0, 5);
    // Still in flight across midnight: it is reserved, so it counts right now.
    expect(limits.usage('u1')).toEqual({ inFlight: 1, reserved: 80, usedToday: 0, remaining: 20 });
    release();
    expect(limits.usage('u1')).toEqual({ inFlight: 0, reserved: 0, usedToday: 0, remaining: 100 });
    expect(codeOf(() => limits.acquire('u1', 100))).toBe('did not throw');
  });

  it('carries usage within the same day', () => {
    const { limits, clock } = setup({ bytesPerDay: 100 });
    clock.t = Date.UTC(2024, 2, 10, 0, 0);
    limits.acquire('u1', 30)();
    clock.t = Date.UTC(2024, 2, 10, 23, 59);
    limits.acquire('u1', 30)();
    expect(limits.usage('u1').usedToday).toBe(60);
  });
});
