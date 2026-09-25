import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { loadPlugins, lazy, PluginLoadError } = solution;

const js = (source) => 'data:text/javascript,' + encodeURIComponent(source);
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// An importModule that hands out promises the test settles by hand.
function manualImporter() {
  const calls = new Map();
  const importModule = (specifier) => {
    const d = deferred();
    calls.set(specifier, d);
    return d.promise;
  };
  return { importModule, calls };
}

const plugin = (name) => ({ default: { name, setup() {} } });

async function rejection(promise) {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected the promise to reject');
}

describe('PluginLoadError', () => {
  it('carries name, specifier, message and cause', () => {
    const cause = new Error('404');
    const e = new PluginLoadError('./x.js', 'nope', { cause });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('PluginLoadError');
    expect(e.specifier).toBe('./x.js');
    expect(e.message).toBe('nope');
    expect(e.cause).toBe(cause);
  });
});

describe('loadPlugins with real import()', () => {
  it('loads default exports and named exports', async () => {
    const plugins = await loadPlugins([
      js('export default { name: "audit", setup() { return "audit ready"; } };'),
      js('export const name = "metrics"; export function setup() { return "metrics ready"; }'),
    ]);
    expect(plugins.map((p) => p.name)).toEqual(['audit', 'metrics']);
    expect(plugins[0].setup()).toBe('audit ready');
    expect(plugins[1].setup()).toBe('metrics ready');
  });

  it('loads a CommonJS plugin (module.exports arrives as default)', async () => {
    const runDir = path.dirname(fileURLToPath(import.meta.url));
    const file = path.join(runDir, 'legacy-plugin.cjs');
    writeFileSync(file, 'module.exports = { name: "legacy", setup() { return 1; } };\n');
    const [legacy] = await loadPlugins([pathToFileURL(file).href]);
    expect(legacy.name).toBe('legacy');
    expect(legacy.setup()).toBe(1);
  });

  it('wraps a failed import, keeping the original error as cause', async () => {
    const runDir = path.dirname(fileURLToPath(import.meta.url));
    const missing = pathToFileURL(path.join(runDir, 'does-not-exist.mjs')).href;
    const e = await rejection(loadPlugins([missing]));
    expect(e).toBeInstanceOf(PluginLoadError);
    expect(e.specifier).toBe(missing);
    expect(e.message).toBe(`Could not load plugin "${missing}"`);
    expect(e.cause).toBeInstanceOf(Error);
    expect(e.cause.code).toBe('ERR_MODULE_NOT_FOUND');
  });

  it('an empty list loads nothing', async () => {
    expect(await loadPlugins([])).toEqual([]);
  });
});

describe('validation', () => {
  const invalid = [
    ['default export without setup', { default: { name: 'x' } }],
    ['setup that is not a function', { default: { name: 'x', setup: 'yes' } }],
    ['empty name', { default: { name: '', setup() {} } }],
    ['bare function as default', { default: function setup() {} }],
    ['no exports at all', {}],
  ];
  for (const [label, mod] of invalid) {
    it(`rejects ${label}`, async () => {
      const e = await rejection(loadPlugins(['bad-plugin'], { importModule: async () => mod }));
      expect(e).toBeInstanceOf(PluginLoadError);
      expect(e.specifier).toBe('bad-plugin');
      expect(e.message).toBe('Plugin "bad-plugin" must export a name and a setup function');
    });
  }

  it('rejects a duplicate name, blaming the later specifier', async () => {
    const mods = { a: plugin('cache'), b: plugin('auth'), c: plugin('cache') };
    const e = await rejection(loadPlugins(['a', 'b', 'c'], { importModule: async (s) => mods[s] }));
    expect(e).toBeInstanceOf(PluginLoadError);
    expect(e.specifier).toBe('c');
    expect(e.message).toBe('Duplicate plugin name "cache"');
  });
});

describe('parallel loading, deterministic results', () => {
  it('starts every import before any finishes', async () => {
    const { importModule, calls } = manualImporter();
    const done = loadPlugins(['a', 'b', 'c'], { importModule });
    await flush();
    expect([...calls.keys()]).toEqual(['a', 'b', 'c']);
    calls.get('c').resolve(plugin('c'));
    calls.get('b').resolve(plugin('b'));
    calls.get('a').resolve(plugin('a'));
    expect((await done).map((p) => p.name)).toEqual(['a', 'b', 'c']);
  });

  it('reports the first failure in specifier order, not in time order', async () => {
    const { importModule, calls } = manualImporter();
    const done = loadPlugins(['a', 'b', 'c'], { importModule });
    const settled = rejection(done);
    await flush();
    calls.get('c').reject(new Error('c broke first'));
    await flush();
    calls.get('a').resolve(plugin('a'));
    await flush();
    calls.get('b').reject(new Error('b broke later'));
    const e = await settled;
    expect(e).toBeInstanceOf(PluginLoadError);
    expect(e.specifier).toBe('b');
    expect(e.cause.message).toBe('b broke later');
  });

  it('an invalid plugin earlier in the list wins over a failed import later', async () => {
    const { importModule, calls } = manualImporter();
    const settled = rejection(loadPlugins(['a', 'b'], { importModule }));
    await flush();
    calls.get('b').reject(new Error('network'));
    await flush();
    calls.get('a').resolve({ default: { name: 'a' } });
    const e = await settled;
    expect(e.specifier).toBe('a');
    expect(e.message).toBe('Plugin "a" must export a name and a setup function');
  });
});

describe('lazy', () => {
  it('does nothing until called, then shares one promise', async () => {
    let calls = 0;
    const d = deferred();
    const load = lazy(() => { calls++; return d.promise; });
    expect(calls).toBe(0);
    const p1 = load();
    const p2 = load();
    expect(p1).toBe(p2);
    await flush();
    expect(calls).toBe(1);
    d.resolve({ default: 'Chart' });
    expect(await p1).toEqual({ default: 'Chart' });
    expect(load()).toBe(p1);
    expect(calls).toBe(1);
  });

  it('works with a real import()', async () => {
    const load = lazy(() => import(js('export default 42;')));
    const [a, b] = await Promise.all([load(), load()]);
    expect(a.default).toBe(42);
    expect(a).toBe(b);
  });

  it('retries after a failure instead of caching it', async () => {
    let calls = 0;
    const load = lazy(async () => {
      calls++;
      if (calls === 1) throw new Error('ChunkLoadError');
      return { default: 'Editor' };
    });
    const first = await rejection(load());
    expect(first.message).toBe('ChunkLoadError');
    const second = await load();
    expect(second).toEqual({ default: 'Editor' });
    expect(calls).toBe(2);
    await load();
    expect(calls).toBe(2);
  });

  it('concurrent callers of a failing load share the failure, then retry once', async () => {
    let calls = 0;
    const d = deferred();
    const load = lazy(() => { calls++; return calls === 1 ? d.promise : Promise.resolve('ok'); });
    const a = load();
    const b = load();
    expect(a).toBe(b);
    d.reject(new Error('offline'));
    await rejection(a);
    await rejection(b);
    expect(await load()).toBe('ok');
    expect(calls).toBe(2);
  });

  it('turns a synchronous throw into a rejection, and retries it', async () => {
    let calls = 0;
    const load = lazy(() => {
      calls++;
      if (calls === 1) throw new Error('bad specifier');
      return Promise.resolve('fine');
    });
    let result;
    expect(() => { result = load(); }).not.toThrow();
    expect((await rejection(result)).message).toBe('bad specifier');
    expect(await load()).toBe('fine');
  });
});
