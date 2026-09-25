const { createFlagClient, bucket, FlagLoadError, UnknownFlagError, PluginError } = solution;
const flush = () => new Promise((r) => setImmediate(r));

const FLAGS = {
  'new-checkout': { enabled: true },
  'dark-mode': { enabled: false, allow: ['u1'] },
  'beta-search': { enabled: true, rollout: 30, allow: ['vip'] },
  'kill-switch': { enabled: true, rollout: 0 },
};

const setup = (options = {}) => {
  const errors = [];
  const warnings = [];
  let fetches = 0;
  const client = createFlagClient({
    fetchFlags: async () => { fetches++; return FLAGS; },
    onError: (e) => errors.push(e),
    warn: (message, code) => warnings.push(code),
    ...options,
  });
  return { client, errors, warnings, fetches: () => fetches };
};
const users = Array.from({ length: 1000 }, (_, i) => ({ id: 'user-' + i }));

describe('evaluation rules', () => {
  it('answers from the loaded definitions, with a reason', async () => {
    const s = setup();
    expect(await s.client.ready()).toBe(true);
    expect(s.client.evaluate('new-checkout', { id: 'u9' })).toEqual({ value: true, reason: 'on' });
    expect(s.client.isEnabled('new-checkout', { id: 'u9' })).toBe(true);
    expect(s.client.evaluate('dark-mode', { id: 'u9' })).toEqual({ value: false, reason: 'disabled' });
  });

  it('a disabled flag is off even for allow-listed users', async () => {
    const s = setup();
    await s.client.ready();
    expect(s.client.evaluate('dark-mode', { id: 'u1' })).toEqual({ value: false, reason: 'disabled' });
  });

  it('allow-listed users bypass the rollout', async () => {
    const s = setup();
    await s.client.ready();
    const outside = users.find((u) => bucket('beta-search', u.id) >= 30);
    expect(s.client.evaluate('beta-search', outside).reason).toBe('rollout');
    expect(s.client.evaluate('beta-search', outside).value).toBe(false);
    expect(s.client.evaluate('beta-search', { id: 'vip' })).toEqual({ value: true, reason: 'allowlist' });
  });

  it('rolls out to users whose bucket is below the percentage, and only them', async () => {
    const s = setup();
    await s.client.ready();
    for (const u of users.slice(0, 200)) {
      expect(s.client.isEnabled('beta-search', u)).toBe(bucket('beta-search', u.id) < 30);
    }
    const on = users.filter((u) => s.client.isEnabled('beta-search', u)).length;
    expect(on).toBeGreaterThan(200);
    expect(on).toBeLessThan(400);
  });

  it('rollout 0 enables nobody (bucket 0 included)', async () => {
    const s = setup();
    await s.client.ready();
    const zero = users.find((u) => bucket('kill-switch', u.id) === 0);
    expect(zero).toBeDefined();
    expect(s.client.isEnabled('kill-switch', zero)).toBe(false);
    expect(users.some((u) => s.client.isEnabled('kill-switch', u))).toBe(false);
  });

  it('a partial rollout is off for an anonymous user', async () => {
    const s = setup();
    await s.client.ready();
    expect(s.client.evaluate('beta-search', undefined)).toEqual({ value: false, reason: 'rollout' });
    expect(s.client.evaluate('beta-search', {})).toEqual({ value: false, reason: 'rollout' });
    expect(s.client.evaluate('new-checkout', undefined)).toEqual({ value: true, reason: 'on' });
  });
});

describe('never throws, never takes the page down', () => {
  it('before ready(), every flag is its default', () => {
    const s = setup({ defaults: { 'new-checkout': true } });
    expect(s.client.evaluate('new-checkout', { id: 'u1' })).toEqual({ value: true, reason: 'default' });
    expect(s.client.evaluate('beta-search', { id: 'u1' })).toEqual({ value: false, reason: 'default' });
    expect(s.errors).toEqual([]);
  });

  it('a failed load resolves false, reports FlagLoadError, and serves defaults', async () => {
    const down = new Error('flags service 503');
    const s = setup({ fetchFlags: async () => { throw down; }, defaults: { 'new-checkout': true } });
    expect(await s.client.ready()).toBe(false);
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]).toBeInstanceOf(FlagLoadError);
    expect(s.errors[0].name).toBe('FlagLoadError');
    expect(s.errors[0].cause).toBe(down);
    expect(s.client.isEnabled('new-checkout', { id: 'u1' })).toBe(true);
  });

  it('a later ready() retries a failed load', async () => {
    let calls = 0;
    const s = setup({ fetchFlags: async () => { if (++calls === 1) throw new Error('blip'); return FLAGS; } });
    expect(await s.client.ready()).toBe(false);
    expect(await s.client.ready()).toBe(true);
    expect(s.client.evaluate('new-checkout', { id: 'x' }).reason).toBe('on');
  });

  it('retries even when fetchFlags throws synchronously', async () => {
    let calls = 0;
    const s = setup({ fetchFlags: () => { if (++calls === 1) throw new Error('sync'); return Promise.resolve(FLAGS); } });
    expect(await s.client.ready()).toBe(false);
    expect(await s.client.ready()).toBe(true);
  });

  it('an unknown flag is its default, reported once per key as UnknownFlagError', async () => {
    const s = setup({ defaults: { 'typo-flag': true } });
    await s.client.ready();
    expect(s.client.evaluate('typo-flag', { id: 'u1' })).toEqual({ value: true, reason: 'default' });
    s.client.isEnabled('typo-flag', { id: 'u2' });
    s.client.isEnabled('other-typo', { id: 'u2' });
    expect(s.errors.map((e) => [e.name, e.key])).toEqual([['UnknownFlagError', 'typo-flag'], ['UnknownFlagError', 'other-typo']]);
    expect(s.errors[0]).toBeInstanceOf(UnknownFlagError);
  });

  it('does not treat inherited names as flags', async () => {
    const s = setup();
    await s.client.ready();
    expect(s.client.evaluate('toString', { id: 'u1' })).toEqual({ value: false, reason: 'default' });
    expect(s.client.evaluate('constructor', { id: 'u1' })).toEqual({ value: false, reason: 'default' });
  });

  it('a throwing onError is swallowed', async () => {
    const s = setup({ onError: () => { throw new Error('logger down'); } });
    await s.client.ready();
    expect(s.client.isEnabled('no-such-flag', { id: 'u1' })).toBe(false);
  });
});

describe('ready() is a lifecycle, not a fetch', () => {
  it('concurrent calls share one fetch, and a loaded client never refetches', async () => {
    const s = setup();
    const [a, b] = await Promise.all([s.client.ready(), s.client.ready()]);
    expect([a, b]).toEqual([true, true]);
    expect(await s.client.ready()).toBe(true);
    expect(s.fetches()).toBe(1);
  });

  it('keeps its own copy of the definitions', async () => {
    const defs = { 'new-checkout': { enabled: true, allow: [] } };
    const s = setup({ fetchFlags: async () => defs });
    await s.client.ready();
    defs['new-checkout'].enabled = false;
    defs.injected = { enabled: true };
    expect(s.client.isEnabled('new-checkout', { id: 'u1' })).toBe(true);
    expect(s.client.evaluate('injected', { id: 'u1' }).reason).toBe('default');
  });
});

describe('plugins', () => {
  it('the first override that returns a boolean wins, even before ready()', async () => {
    const qa = { name: 'qa-cookie', override: (key, user) => (user?.id === 'qa' ? true : undefined) };
    const off = { name: 'force-off', override: (key) => (key === 'new-checkout' ? false : undefined) };
    const s = setup({ plugins: [qa, off] });
    expect(s.client.evaluate('beta-search', { id: 'qa' })).toEqual({ value: true, reason: 'override' });
    await s.client.ready();
    expect(s.client.evaluate('new-checkout', { id: 'u9' })).toEqual({ value: false, reason: 'override' });
    expect(s.client.evaluate('new-checkout', { id: 'qa' })).toEqual({ value: true, reason: 'override' });
    expect(s.client.evaluate('dark-mode', { id: 'u9' }).reason).toBe('disabled');
  });

  it('a throwing override is skipped and reported as PluginError', async () => {
    const bad = new Error('cookie parse failed');
    const s = setup({ plugins: [{ name: 'broken', override: () => { throw bad; } }] });
    await s.client.ready();
    expect(s.client.evaluate('new-checkout', { id: 'u1' })).toEqual({ value: true, reason: 'on' });
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]).toBeInstanceOf(PluginError);
    expect([s.errors[0].plugin, s.errors[0].hook, s.errors[0].cause]).toEqual(['broken', 'override', bad]);
  });

  it('onEvaluate sees every decision; a throwing one changes nothing', async () => {
    const seen = [];
    const s = setup({
      plugins: [
        { name: 'analytics', onEvaluate: () => { throw new Error('beacon failed'); } },
        { name: 'audit', onEvaluate: (e) => seen.push(e) },
      ],
    });
    await s.client.ready();
    expect(s.client.isEnabled('dark-mode', { id: 'u3' })).toBe(false);
    expect(seen).toEqual([{ key: 'dark-mode', userId: 'u3', value: false, reason: 'disabled' }]);
    expect(s.errors.map((e) => [e.plugin, e.hook])).toEqual([['analytics', 'onEvaluate']]);
  });
});

describe('options and deprecations', () => {
  it('rejects unknown options and a missing fetchFlags at construction', () => {
    expect(() => createFlagClient({ fetchFlags: async () => ({}), onErorr: () => {} })).toThrow(TypeError);
    expect(() => createFlagClient({})).toThrow(TypeError);
  });

  it('isOn() still works, warning once with FLAGS_DEP_001', async () => {
    const s = setup();
    await s.client.ready();
    expect(s.client.isOn('new-checkout', { id: 'u1' })).toBe(true);
    expect(s.client.isOn('dark-mode', { id: 'u1' })).toBe(false);
    expect(s.warnings).toEqual(['FLAGS_DEP_001']);
  });

  it('the old defaultValues option still works, warning once with FLAGS_DEP_002', () => {
    const s = setup({ defaultValues: { 'new-checkout': true } });
    expect(s.client.isEnabled('new-checkout', { id: 'u1' })).toBe(true);
    expect(s.warnings).toEqual(['FLAGS_DEP_002']);
  });

  it('refuses defaults and defaultValues together', () => {
    expect(() => createFlagClient({ fetchFlags: async () => ({}), defaults: {}, defaultValues: {} })).toThrow(TypeError);
  });

  it('the new API never warns', async () => {
    const s = setup({ defaults: {} });
    await s.client.ready();
    s.client.isEnabled('new-checkout', { id: 'u1' });
    s.client.evaluate('new-checkout', { id: 'u1' });
    expect(s.warnings).toEqual([]);
  });

  it('does not keep a reference to the caller\'s defaults', () => {
    const defaults = { 'new-checkout': true };
    const s = setup({ defaults });
    defaults['new-checkout'] = false;
    expect(s.client.isEnabled('new-checkout', { id: 'u1' })).toBe(true);
  });
});
