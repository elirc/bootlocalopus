import { access, mkdtemp, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * os.tmpdir() reads TEMP/TMP; a grading sandbox with a bare environment on
 * Windows has neither, so fall back to this run's own scratch folder.
 */
const tmpBase = async () => {
  try { await access(os.tmpdir()); return os.tmpdir(); } catch { return path.dirname(fileURLToPath(import.meta.url)); }
};

const withDir = async (fn) => {
  const dir = await mkdtemp(path.join(await tmpBase(), 'walk-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** { 'a.js': 'text', sub: { 'b.js': '' } } -> files and folders under dir. */
const build = async (dir, spec) => {
  for (const [name, value] of Object.entries(spec)) {
    const p = path.join(dir, name);
    if (typeof value === 'string') await writeFile(p, value);
    else { await mkdir(p); await build(p, value); }
  }
};

const within = (promise, ms, message) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
};

const collect = async (root, options) => {
  const out = [];
  const run = (async () => { for await (const p of solution.walk(root, options)) out.push(p); })();
  await within(run, 4000, 'walk did not finish within 4 s');
  return out.sort();
};

const project = {
  'package.json': '{}',
  'README.md': '# hi',
  src: {
    'index.js': '',
    'App.JSX': '',
    lib: { 'util.js': '', 'util.test.js': '', 'notes.txt': '' },
    'lib.js': { 'inner.ts': '' }, // a directory with an extension-like name
  },
  node_modules: { dep: { 'index.js': '' } },
  '.git': { HEAD: 'ref: refs/heads/main' },
  empty: {},
};

describe('walk', () => {
  it('is an async generator', () => withDir(async (dir) => {
    await build(dir, { 'a.txt': '' });
    const it = solution.walk(dir);
    expect(typeof it[Symbol.asyncIterator]).toBe('function');
    expect(typeof it.next).toBe('function');
    await it.return?.();
  }));

  it('yields every file, relative to root, with / separators', () => withDir(async (dir) => {
    await build(dir, project);
    expect(await collect(dir)).toEqual([
      '.git/HEAD',
      'README.md',
      'node_modules/dep/index.js',
      'package.json',
      'src/App.JSX',
      'src/index.js',
      'src/lib.js/inner.ts',
      'src/lib/notes.txt',
      'src/lib/util.js',
      'src/lib/util.test.js',
    ]);
  }));

  it('skips ignored names at any depth, files and directories', () => withDir(async (dir) => {
    await build(dir, project);
    const out = await collect(dir, { ignore: ['node_modules', '.git', 'notes.txt'] });
    expect(out).toEqual([
      'README.md',
      'package.json',
      'src/App.JSX',
      'src/index.js',
      'src/lib.js/inner.ts',
      'src/lib/util.js',
      'src/lib/util.test.js',
    ]);
  }));

  it('filters by extension, case-insensitively, and never yields directories', () => withDir(async (dir) => {
    await build(dir, project);
    const out = await collect(dir, { ignore: ['node_modules'], extensions: ['.js', '.jsx'] });
    expect(out).toEqual(['src/App.JSX', 'src/index.js', 'src/lib/util.js', 'src/lib/util.test.js']);
  }));

  it('yields nothing for an empty directory', () => withDir(async (dir) => {
    expect(await collect(dir)).toEqual([]);
  }));

  it('walks deep trees', () => withDir(async (dir) => {
    let spec = { 'leaf.txt': 'x' };
    for (let i = 9; i >= 0; i--) spec = { ['d' + i]: spec };
    await build(dir, spec);
    expect(await collect(dir)).toEqual(['d0/d1/d2/d3/d4/d5/d6/d7/d8/d9/leaf.txt']);
  }));

  it('does not follow a directory link that points back up the tree', () => withDir(async (dir) => {
    await build(dir, { a: { 'x.txt': '' }, 'top.txt': '' });
    // 'junction' needs no admin rights on Windows; elsewhere it is an ordinary directory symlink.
    await symlink(dir, path.join(dir, 'a', 'loop'), 'junction');
    expect(await collect(dir)).toEqual(['a/x.txt', 'top.txt']);
  }));

  it('does not yield a link to a directory elsewhere either', () => withDir(async (dir) => {
    await build(dir, { real: { 'r.txt': '' }, other: {} });
    await symlink(path.join(dir, 'real'), path.join(dir, 'other', 'shortcut'), 'junction');
    expect(await collect(dir)).toEqual(['real/r.txt']);
  }));

  it('rejects with ENOENT when the root does not exist', () => withDir(async (dir) => {
    let caught;
    try {
      for await (const p of solution.walk(path.join(dir, 'missing'))) void p;
    } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect(caught.code).toBe('ENOENT');
  }));
});
