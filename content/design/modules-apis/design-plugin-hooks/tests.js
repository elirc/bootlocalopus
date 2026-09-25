const { createPipeline, PluginError, ValidationError } = solution;
const post = (o = {}) => ({ title: 'Hello', body: 'hi', tags: [], ...o });
const rejection = async (promise) => {
  try { await promise; } catch (e) { return e; }
  throw new Error('expected the run to reject, but it resolved');
};
/** A plugin whose transform appends its name to `trail`. */
const tracer = (name, extra = {}) => ({
  name,
  transform: (p) => ({ ...p, trail: [...(p.trail ?? []), name] }),
  ...extra,
});

describe('transform is a waterfall', () => {
  it('passes each plugin the previous plugin\'s output', async () => {
    const pipeline = createPipeline({
      plugins: [
        { name: 'trim', transform: (p) => ({ ...p, title: p.title.trim() }) },
        { name: 'upper', transform: (p) => ({ ...p, title: p.title.toUpperCase() }) },
      ],
    });
    expect(await pipeline.run(post({ title: '  Hello  ' }))).toEqual(post({ title: 'HELLO' }));
  });

  it('treats undefined as "unchanged" but keeps other falsy results', async () => {
    const pipeline = createPipeline({
      plugins: [
        { name: 'observer', transform: () => undefined },
        { name: 'blank', transform: () => '' },
      ],
    });
    expect(await pipeline.run('text')).toBe('');
    const onlyObserver = createPipeline({ plugins: [{ name: 'observer', transform: () => undefined }] });
    expect(await onlyObserver.run('text')).toBe('text');
    const clear = createPipeline({ plugins: [{ name: 'clear', transform: () => null }] });
    expect(await clear.run('text')).toBeNull();
  });

  it('awaits async transforms in order', async () => {
    const pipeline = createPipeline({
      plugins: [
        { name: 'slow', transform: async (s) => { await new Promise((r) => setTimeout(r, 5)); return s + 'a'; } },
        { name: 'fast', transform: (s) => s + 'b' },
      ],
    });
    expect(await pipeline.run('')).toBe('ab');
  });

  it('works with plugins that implement only some hooks', async () => {
    const pipeline = createPipeline({ plugins: [{ name: 'nothing' }, tracer('t')] });
    expect((await pipeline.run(post())).trail).toEqual(['t']);
  });

  it('calls hooks as methods, so plugins can use `this`', async () => {
    class Prefix {
      constructor(prefix) { this.name = 'prefix'; this.prefix = prefix; }
      transform(s) { return this.prefix + s; }
      validate(s) { return s.startsWith(this.prefix) ? undefined : 'lost the prefix'; }
    }
    expect(await createPipeline({ plugins: [new Prefix('> ')] }).run('quote')).toBe('> quote');
  });
});

describe('ordering', () => {
  it('runs pre, then normal, then post, keeping registration order within each', async () => {
    const pipeline = createPipeline({
      plugins: [
        tracer('a'),
        tracer('late-1', { enforce: 'post' }),
        tracer('early-1', { enforce: 'pre' }),
        tracer('b'),
        tracer('early-2', { enforce: 'pre' }),
        tracer('late-2', { enforce: 'post' }),
      ],
    });
    expect((await pipeline.run(post())).trail).toEqual(['early-1', 'early-2', 'a', 'b', 'late-1', 'late-2']);
    expect(pipeline.names()).toEqual(['early-1', 'early-2', 'a', 'b', 'late-1', 'late-2']);
  });

  it('rejects bad plugin lists when the pipeline is created', () => {
    expect(() => createPipeline({ plugins: [tracer('a'), tracer('a')] })).toThrow(Error);
    expect(() => createPipeline({ plugins: [{ transform: (x) => x }] })).toThrow(TypeError);
    expect(() => createPipeline({ plugins: [tracer('a', { enforce: 'first' })] })).toThrow(TypeError);
  });

  it('does not reorder the caller\'s array', () => {
    const plugins = [tracer('a'), tracer('z', { enforce: 'pre' })];
    createPipeline({ plugins });
    expect(plugins.map((p) => p.name)).toEqual(['a', 'z']);
  });

  it('works with no plugins at all', async () => {
    expect(await createPipeline().run(post())).toEqual(post());
  });
});

describe('validate bails at the first objection', () => {
  it('rejects with ValidationError naming the plugin, and skips later validators', async () => {
    const calls = [];
    const pipeline = createPipeline({
      plugins: [
        { name: 'has-title', validate: (p) => { calls.push('has-title'); return p.title ? undefined : 'A title is required'; } },
        { name: 'short-title', validate: (p) => { calls.push('short-title'); return p.title.length <= 5 ? undefined : 'Title too long'; } },
        { name: 'never', validate: () => { calls.push('never'); } },
      ],
    });
    const e = await rejection(pipeline.run(post({ title: 'Much too long' })));
    expect(e).toBeInstanceOf(ValidationError);
    expect(e.name).toBe('ValidationError');
    expect(e.message).toBe('Title too long');
    expect(e.plugin).toBe('short-title');
    expect(calls).toEqual(['has-title', 'short-title']);
  });

  it('validates the transformed value, and passes when nobody objects', async () => {
    const pipeline = createPipeline({
      plugins: [
        { name: 'nonempty', validate: (p) => (p.body ? undefined : 'Body is empty') },
        { name: 'default-body', enforce: 'pre', transform: (p) => ({ ...p, body: p.body || '(empty)' }) },
      ],
    });
    expect((await pipeline.run(post({ body: '' }))).body).toBe('(empty)');
  });

  it('does not run onComplete when validation fails', async () => {
    const done = [];
    const pipeline = createPipeline({
      plugins: [
        { name: 'no', validate: () => 'nope' },
        { name: 'notify', onComplete: (p) => done.push(p) },
      ],
    });
    await rejection(pipeline.run(post()));
    expect(done).toEqual([]);
  });
});

describe('a broken plugin says who it is', () => {
  it('wraps a throwing transform in PluginError with plugin, hook and cause', async () => {
    const cause = new TypeError('p.tags is not iterable');
    const pipeline = createPipeline({
      plugins: [tracer('fine'), { name: 'tagger', transform: () => { throw cause; } }],
    });
    const e = await rejection(pipeline.run(post()));
    expect(e).toBeInstanceOf(PluginError);
    expect(e.name).toBe('PluginError');
    expect(e.plugin).toBe('tagger');
    expect(e.hook).toBe('transform');
    expect(e.cause).toBe(cause);
    expect(e.message).toBe('[tagger] transform failed: p.tags is not iterable');
  });

  it('wraps async rejections and throwing validators too', async () => {
    const asyncBoom = createPipeline({ plugins: [{ name: 'fetcher', transform: async () => { throw new Error('offline'); } }] });
    const e1 = await rejection(asyncBoom.run(post()));
    expect(e1).toBeInstanceOf(PluginError);
    expect(e1.message).toBe('[fetcher] transform failed: offline');
    const badValidator = createPipeline({ plugins: [{ name: 'strict', validate: () => { throw new Error('bug'); } }] });
    const e2 = await rejection(badValidator.run(post()));
    expect(e2).toBeInstanceOf(PluginError);
    expect(e2.hook).toBe('validate');
    expect(e2).not.toBeInstanceOf(ValidationError);
  });
});

describe('onComplete notifies everyone and cannot fail the run', () => {
  it('calls every onComplete in order with the final value and reports failures', async () => {
    const seen = [];
    const reported = [];
    const boom = new Error('search index down');
    const pipeline = createPipeline({
      plugins: [
        { name: 'index', onComplete: async () => { throw boom; } },
        { name: 'audit', onComplete: (p) => { seen.push(p.title); } },
        { name: 'upper', transform: (p) => ({ ...p, title: p.title.toUpperCase() }) },
      ],
      onPluginError: (error, info) => reported.push({ error, info }),
    });
    expect(await pipeline.run(post())).toEqual(post({ title: 'HELLO' }));
    expect(seen).toEqual(['HELLO']);
    expect(reported).toEqual([{ error: boom, info: { plugin: 'index', hook: 'onComplete' } }]);
  });

  it('survives an onComplete failure even without an onPluginError option, or with a throwing one', async () => {
    const plugins = [{ name: 'x', onComplete: () => { throw new Error('x'); } }];
    expect(await createPipeline({ plugins }).run('ok')).toBe('ok');
    expect(await createPipeline({ plugins, onPluginError: () => { throw new Error('reporter down'); } }).run('ok')).toBe('ok');
  });
});

describe('the context', () => {
  it('is shared by all hooks within one run and fresh for the next', async () => {
    const seen = [];
    const pipeline = createPipeline({
      plugins: [
        { name: 'count', transform: (p, ctx) => { ctx.meta.words = (ctx.meta.words ?? 0) + p.body.split(' ').length; } },
        { name: 'report', onComplete: (p, ctx) => { seen.push(ctx.meta.words); } },
      ],
    });
    await pipeline.run(post({ body: 'one two three' }));
    await pipeline.run(post({ body: 'four five' }));
    expect(seen).toEqual([3, 2]);
  });
});
