const { evaluateFlag, fnv1a32 } = solution;

// The grader's own copy of the bucketing rule, so a test can say who should be in.
const bucket = (key, id) => fnv1a32(`${key}:${id}`) % 10000;

const aFlag = (overrides = {}) => ({ key: 'new-checkout', enabled: true, rolloutPercent: 100, ...overrides });
const users = (n, prefix = 'u_') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));
const enabledIds = (flag, list) => list.filter((u) => evaluateFlag(flag, u).enabled).map((u) => u.id);

describe('evaluateFlag: switches and lists', () => {
  it('turns the flag off for everyone when the kill switch is off', () => {
    const flag = aFlag({ enabled: false, allow: ['u_1'] });
    expect(evaluateFlag(flag, { id: 'u_1' })).toEqual({ enabled: false, reason: 'killed' });
    expect(evaluateFlag(flag, { id: 'u_2' })).toEqual({ enabled: false, reason: 'killed' });
  });

  it('turns it on for allowed users even at 0 %, and off for denied users at 100 %', () => {
    expect(evaluateFlag(aFlag({ rolloutPercent: 0, allow: ['u_staff'] }), { id: 'u_staff' })).toEqual({ enabled: true, reason: 'allowed' });
    expect(evaluateFlag(aFlag({ rolloutPercent: 100, deny: ['u_bot'] }), { id: 'u_bot' })).toEqual({ enabled: false, reason: 'denied' });
  });

  it('lets deny win over allow', () => {
    const flag = aFlag({ allow: ['u_1'], deny: ['u_1'] });
    expect(evaluateFlag(flag, { id: 'u_1' })).toEqual({ enabled: false, reason: 'denied' });
  });

  it('checks allow before targeting rules', () => {
    const flag = aFlag({ allow: ['u_1'], rules: [{ attribute: 'country', in: ['GB'] }] });
    expect(evaluateFlag(flag, { id: 'u_1', country: 'US' })).toEqual({ enabled: true, reason: 'allowed' });
  });
});

describe('evaluateFlag: targeting rules', () => {
  const flag = aFlag({ rules: [{ attribute: 'country', in: ['GB', 'IE'] }, { attribute: 'plan', in: ['pro'] }] });

  it('turns it on only when every rule matches', () => {
    expect(evaluateFlag(flag, { id: 'u_1', country: 'IE', plan: 'pro' })).toEqual({ enabled: true, reason: 'rollout' });
    expect(evaluateFlag(flag, { id: 'u_1', country: 'US', plan: 'pro' })).toEqual({ enabled: false, reason: 'not-targeted' });
    expect(evaluateFlag(flag, { id: 'u_1', country: 'GB', plan: 'free' })).toEqual({ enabled: false, reason: 'not-targeted' });
  });

  it('treats a missing attribute as not matching', () => {
    expect(evaluateFlag(flag, { id: 'u_1', plan: 'pro' })).toEqual({ enabled: false, reason: 'not-targeted' });
  });

  it('applies rules before the rollout percentage', () => {
    expect(evaluateFlag({ ...flag, rolloutPercent: 0 }, { id: 'u_1', country: 'US', plan: 'pro' })).toEqual({ enabled: false, reason: 'not-targeted' });
  });
});

describe('evaluateFlag: percentage rollout', () => {
  it('puts exactly the users whose bucket is below the line in the rollout', () => {
    const flag = aFlag({ key: 'pricing-v2', rolloutPercent: 30 });
    const list = users(400);
    expect(enabledIds(flag, list)).toEqual(list.filter((u) => bucket('pricing-v2', u.id) < 3000).map((u) => u.id));
    for (const u of list.slice(0, 20)) expect(evaluateFlag(flag, u).reason).toBe('rollout');
  });

  it('is sticky: the same user gets the same answer every time', () => {
    const flag = aFlag({ rolloutPercent: 50 });
    const list = users(200);
    const first = list.map((u) => evaluateFlag(flag, u).enabled);
    for (let round = 0; round < 3; round++) {
      expect(list.map((u) => evaluateFlag(flag, { ...u }).enabled)).toEqual(first);
    }
  });

  it('gives roughly the requested share of users', () => {
    const on = enabledIds(aFlag({ rolloutPercent: 25 }), users(10000)).length;
    expect(on).toBeGreaterThan(2300);
    expect(on).toBeLessThan(2700);
  });

  it('is independent per flag: two 50 % rollouts overlap on about a quarter of users', () => {
    const list = users(4000);
    const a = new Set(enabledIds(aFlag({ key: 'flag-a', rolloutPercent: 50 }), list));
    const b = enabledIds(aFlag({ key: 'flag-b', rolloutPercent: 50 }), list);
    const both = b.filter((id) => a.has(id)).length;
    expect(both).toBeGreaterThan(800);
    expect(both).toBeLessThan(1200);
  });

  it('is monotonic: ramping up only adds users', () => {
    const list = users(3000);
    const at10 = enabledIds(aFlag({ rolloutPercent: 10 }), list);
    const at20 = new Set(enabledIds(aFlag({ rolloutPercent: 20 }), list));
    expect(at10.every((id) => at20.has(id))).toBe(true);
    expect(at20.size).toBeGreaterThan(at10.length);
  });

  it('supports fractional percentages with 0.01 % buckets', () => {
    const list = users(20000);
    const expected = list.filter((u) => bucket('canary', u.id) < 50).map((u) => u.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(enabledIds(aFlag({ key: 'canary', rolloutPercent: 0.5 }), list)).toEqual(expected);
  });

  it('turns it on for everyone at 100 % and nobody at 0 %', () => {
    const list = users(300);
    expect(enabledIds(aFlag({ rolloutPercent: 100 }), list)).toHaveLength(300);
    expect(enabledIds(aFlag({ rolloutPercent: 0 }), list)).toHaveLength(0);
  });
});

describe('evaluateFlag: anonymous users', () => {
  it('keeps anonymous users out of a partial rollout', () => {
    const flag = aFlag({ rolloutPercent: 99.99 });
    expect(evaluateFlag(flag, { country: 'GB' })).toEqual({ enabled: false, reason: 'anonymous' });
    expect(evaluateFlag(flag, { id: null })).toEqual({ enabled: false, reason: 'anonymous' });
  });

  it('includes anonymous users at 100 %, but still applies the kill switch and rules first', () => {
    expect(evaluateFlag(aFlag({ rolloutPercent: 100 }), {})).toEqual({ enabled: true, reason: 'rollout' });
    expect(evaluateFlag(aFlag({ enabled: false }), {})).toEqual({ enabled: false, reason: 'killed' });
    expect(evaluateFlag(aFlag({ rules: [{ attribute: 'country', in: ['GB'] }] }), { country: 'FR' })).toEqual({ enabled: false, reason: 'not-targeted' });
  });
});

describe('evaluateFlag: misconfiguration', () => {
  it('throws a RangeError for a percentage outside 0 to 100 or not a number', () => {
    for (const rolloutPercent of [-1, 100.5, '50', NaN, undefined]) {
      expect(() => evaluateFlag(aFlag({ rolloutPercent }), { id: 'u_1' })).toThrow(RangeError);
    }
  });

  it('validates even when the kill switch is off', () => {
    expect(() => evaluateFlag(aFlag({ enabled: false, rolloutPercent: 150 }), { id: 'u_1' })).toThrow(RangeError);
  });
});
