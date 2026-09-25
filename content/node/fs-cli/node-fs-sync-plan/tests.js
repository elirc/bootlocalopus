import { access, mkdtemp, rm, writeFile, mkdir, readFile, readdir, utimes } from 'node:fs/promises';
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
  const dir = await mkdtemp(path.join(await tmpBase(), 'sync-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** { 'a.js': 'text', sub: { 'b.js': '' } } -> files and folders under dir. */
const build = async (dir, spec) => {
  await mkdir(dir, { recursive: true });
  for (const [name, value] of Object.entries(spec)) {
    const p = path.join(dir, name);
    if (typeof value === 'string') await writeFile(p, value);
    else await build(p, value);
  }
};

/** The whole tree as { 'rel/path': 'content' }, '/'-joined. */
const snapshot = async (dir, rel = '', out = {}) => {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await snapshot(path.join(dir, e.name), r, out);
    else out[r] = await readFile(path.join(dir, e.name), 'utf8');
  }
  return out;
};

const setup = (fn) => withDir(async (dir) => {
  const src = path.join(dir, 'src');
  const dest = path.join(dir, 'dest');
  return fn(src, dest);
});

describe('planSync', () => {
  it('plans copies for new files, with / separators, sorted by path', () => setup(async (src, dest) => {
    await build(src, { 'index.html': '<h1>', assets: { 'app.js': 'js', img: { 'logo.svg': '<svg>' } }, 'a.txt': 'a' });
    await build(dest, {});
    expect(await solution.planSync(src, dest)).toEqual([
      { action: 'copy', path: 'a.txt' },
      { action: 'copy', path: 'assets/app.js' },
      { action: 'copy', path: 'assets/img/logo.svg' },
      { action: 'copy', path: 'index.html' },
    ]);
  }));

  it('skips identical files and plans updates for changed ones', () => setup(async (src, dest) => {
    await build(src, { 'same.txt': 'unchanged', 'grown.txt': 'longer now', sub: { 'x.css': 'a{}' } });
    await build(dest, { 'same.txt': 'unchanged', 'grown.txt': 'short', sub: { 'x.css': 'a{}' } });
    expect(await solution.planSync(src, dest)).toEqual([{ action: 'update', path: 'grown.txt' }]);
  }));

  it('compares content when sizes match, whatever the mtimes say', () => setup(async (src, dest) => {
    await build(src, { 'config.yml': 'port: 9090\n', 'same.yml': 'x: 1\n' });
    await build(dest, { 'config.yml': 'port: 8080\n', 'same.yml': 'x: 1\n' });
    const t = 1_700_000_000;
    await utimes(path.join(src, 'config.yml'), t, t);
    await utimes(path.join(dest, 'config.yml'), t, t);
    await utimes(path.join(src, 'same.yml'), t, t);
    await utimes(path.join(dest, 'same.yml'), t + 5000, t + 5000);
    expect(await solution.planSync(src, dest)).toEqual([{ action: 'update', path: 'config.yml' }]);
  }));

  it('plans deletes only when deleteExtra is true', () => setup(async (src, dest) => {
    await build(src, { 'keep.txt': 'k' });
    await build(dest, { 'keep.txt': 'k', 'old.txt': 'o', stale: { 'gone.js': 'g' } });
    expect(await solution.planSync(src, dest)).toEqual([]);
    expect(await solution.planSync(src, dest, { deleteExtra: true })).toEqual([
      { action: 'delete', path: 'old.txt' },
      { action: 'delete', path: 'stale/gone.js' },
    ]);
  }));

  it('mixes actions in one sorted list', () => setup(async (src, dest) => {
    await build(src, { b: { 'new.txt': 'n' }, 'c.txt': 'v2', 'a.txt': 'same' });
    await build(dest, { 'a.txt': 'same', 'c.txt': 'v1', 'b.txt': 'extra' });
    expect(await solution.planSync(src, dest, { deleteExtra: true })).toEqual([
      { action: 'delete', path: 'b.txt' }, // '.' sorts before '/'
      { action: 'copy', path: 'b/new.txt' },
      { action: 'update', path: 'c.txt' },
    ]);
  }));

  it('treats a missing destination as empty and ignores empty folders', () => setup(async (src, dest) => {
    await build(src, { 'x.txt': 'x', empty: {}, deep: { deeper: {} } });
    expect(await solution.planSync(src, path.join(dest, 'not-yet'))).toEqual([{ action: 'copy', path: 'x.txt' }]);
  }));

  it('rejects with ENOENT for a missing source', () => setup(async (src, dest) => {
    await build(dest, { 'x.txt': 'x' });
    let caught;
    try {
      await solution.planSync(src, dest, { deleteExtra: true });
    } catch (e) {
      caught = e;
    }
    expect(caught && caught.code).toBe('ENOENT');
  }));

  it('changes nothing on disk (a dry run is safe)', () => setup(async (src, dest) => {
    await build(src, { 'a.txt': 'new', sub: { 'b.txt': 'b' } });
    await build(dest, { 'a.txt': 'old', 'z.txt': 'z' });
    const before = await snapshot(dest);
    await solution.planSync(src, dest, { deleteExtra: true });
    expect(await snapshot(dest)).toEqual(before);
  }));
});

describe('applySync', () => {
  it('applies a plan so that the trees match and a new plan is empty', () => setup(async (src, dest) => {
    await build(src, { 'a.txt': 'new', sub: { deeper: { 'b.txt': 'b' } }, 'same.txt': 's' });
    await build(dest, { 'a.txt': 'old', 'z.txt': 'z', 'same.txt': 's', old: { 'q.txt': 'q' } });
    const plan = await solution.planSync(src, dest, { deleteExtra: true });
    await solution.applySync(src, dest, plan);
    const after = await snapshot(dest);
    expect(after).toEqual({ 'a.txt': 'new', 'sub/deeper/b.txt': 'b', 'same.txt': 's' });
    expect(await solution.planSync(src, dest, { deleteExtra: true })).toEqual([]);
  }));

  it('creates the destination directory when it does not exist', () => setup(async (src, dest) => {
    await build(src, { 'x.txt': 'x', y: { 'z.txt': 'z' } });
    const target = path.join(dest, 'fresh');
    await solution.applySync(src, target, await solution.planSync(src, target));
    expect(await snapshot(target)).toEqual({ 'x.txt': 'x', 'y/z.txt': 'z' });
  }));

  it('does only what the plan says', () => setup(async (src, dest) => {
    await build(src, { 'a.txt': 'A', 'b.txt': 'B' });
    await build(dest, { 'c.txt': 'C' });
    await solution.applySync(src, dest, [{ action: 'copy', path: 'b.txt' }]);
    expect(await snapshot(dest)).toEqual({ 'b.txt': 'B', 'c.txt': 'C' });
  }));
});
