import { access, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
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
  const dir = await mkdtemp(path.join(await tmpBase(), 'dupes-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const build = async (dir, spec) => {
  await mkdir(dir, { recursive: true });
  for (const [name, value] of Object.entries(spec)) {
    const p = path.join(dir, name);
    if (typeof value === 'string') await writeFile(p, value);
    else await build(p, value);
  }
};

const USAGE = 'usage: find-dupes [--json] [--min-size <bytes>] <dir>...\n';

const run = async (argv) => {
  let out = '';
  let err = '';
  const io = {
    stdout: { write: (s) => { out += s; return true; } },
    stderr: { write: (s) => { err += s; return true; } },
  };
  let code;
  try {
    code = await solution.main(argv, io);
  } catch (e) {
    throw new Error(`main threw (${e.message}); it must resolve an exit code instead`);
  }
  return { code, out, err };
};

const json = (r) => {
  expect(r.out.endsWith('\n')).toBe(true);
  expect(r.out.trimEnd().includes('\n')).toBe(false);
  return JSON.parse(r.out);
};

describe('find-dupes: finding duplicates', () => {
  it('prints groups, sorted, with a summary line', () => withDir(async (root) => {
    const a = path.join(root, 'a');
    await build(a, {
      'big1.bin': 'B'.repeat(20),
      sub: { 'big2.bin': 'B'.repeat(20), 'x.txt': 'hello' },
      'y.txt': 'hello',
      'z.txt': 'world', // same size as hello, different content
      'lonely.txt': 'only one of me',
    });
    const r = await run([a]);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toBe(
      '20 bytes, 2 copies:\n' +
      `  ${a}/big1.bin\n` +
      `  ${a}/sub/big2.bin\n` +
      '\n' +
      '5 bytes, 2 copies:\n' +
      `  ${a}/sub/x.txt\n` +
      `  ${a}/y.txt\n` +
      '\n' +
      '2 duplicate groups, 25 bytes wasted\n',
    );
  }));

  it('splits same-size files by content and counts every copy', () => withDir(async (root) => {
    await build(root, { 'p1': 'aaaa', 'p2': 'aaaa', 'p3': 'aaaa', 'q1': 'bbbb', 'q2': 'bbbb', 'r': 'cccc' });
    const r = json(await run(['--json', root]));
    expect(r).toEqual({
      groups: [
        { size: 4, paths: [`${root}/p1`, `${root}/p2`, `${root}/p3`] },
        { size: 4, paths: [`${root}/q1`, `${root}/q2`] },
      ],
      wastedBytes: 12,
    });
  }));

  it('finds duplicates across several directory arguments', () => withDir(async (root) => {
    const photos = path.join(root, 'photos');
    const backup = path.join(root, 'backup');
    await build(photos, { 'cat.jpg': 'meow-meow' });
    await build(backup, { old: { 'cat-copy.jpg': 'meow-meow' } });
    const r = json(await run([photos, backup, '--json']));
    expect(r.groups).toEqual([{ size: 9, paths: [`${backup}/old/cat-copy.jpg`, `${photos}/cat.jpg`] }]);
    expect(r.wastedBytes).toBe(9);
  }));

  it('counts a file reached through two overlapping arguments only once', () => withDir(async (root) => {
    await build(root, { sub: { 'only.txt': 'same bytes' }, 'other.txt': 'different!' });
    const r = await run([root, path.join(root, 'sub')]);
    expect(r).toEqual({ code: 0, out: 'no duplicates\n', err: '' });
  }));

  it('skips node_modules and .git directories', () => withDir(async (root) => {
    await build(root, {
      'index.js': 'module.exports = 1',
      node_modules: { lib: { 'index.js': 'module.exports = 1' } },
      '.git': { 'blob': 'module.exports = 1' },
    });
    expect((await run([root])).out).toBe('no duplicates\n');
  }));

  it('ignores empty files by default and honours --min-size', () => withDir(async (root) => {
    await build(root, { 'e1': '', 'e2': '', 's1': 'ab', 's2': 'ab', 'l1': 'abcdef', 'l2': 'abcdef' });
    expect(json(await run(['--json', root])).groups.map((g) => g.size)).toEqual([6, 2]);
    expect(json(await run(['--json', '--min-size', '3', root])).groups.map((g) => g.size)).toEqual([6]);
    expect(json(await run(['--json', '--min-size=6', root])).groups.map((g) => g.size)).toEqual([6]);
    const all = json(await run(['--min-size=0', '--json', root]));
    expect(all.groups.map((g) => g.size)).toEqual([6, 2, 0]);
    expect(all.wastedBytes).toBe(8);
  }));

  it('prints "no duplicates" and a JSON document with empty groups', () => withDir(async (root) => {
    await build(root, { 'a': '1', 'b': '22' });
    expect(await run([root])).toEqual({ code: 0, out: 'no duplicates\n', err: '' });
    expect(json(await run([root, '--json']))).toEqual({ groups: [], wastedBytes: 0 });
  }));

  it('uses "groups" in the summary even for one group', () => withDir(async (root) => {
    await build(root, { 'a': 'xyz', 'b': 'xyz' });
    const r = await run([root]);
    expect(r.out.endsWith('\n1 duplicate groups, 3 bytes wasted\n')).toBe(true);
  }));
});

describe('find-dupes: errors and exit codes', () => {
  it('reports a missing directory, scans the rest, and exits 1', () => withDir(async (root) => {
    const good = path.join(root, 'good');
    const missing = path.join(root, 'missing');
    await build(good, { 'a': 'dup', 'b': 'dup' });
    const r = await run([missing, good]);
    expect(r.err).toBe(`find-dupes: ${missing}: no such directory\n`);
    expect(r.out).toBe(`3 bytes, 2 copies:\n  ${good}/a\n  ${good}/b\n\n1 duplicate groups, 3 bytes wasted\n`);
    expect(r.code).toBe(1);
  }));

  it('reports a file argument as "not a directory"', () => withDir(async (root) => {
    const file = path.join(root, 'notes.txt');
    await writeFile(file, 'x');
    const r = await run(['--json', file]);
    expect(r.err).toBe(`find-dupes: ${file}: not a directory\n`);
    expect(json(r)).toEqual({ groups: [], wastedBytes: 0 });
    expect(r.code).toBe(1);
  }));

  it('exits 2 with only the usage when no directory is given', async () => {
    expect(await run([])).toEqual({ code: 2, out: '', err: USAGE });
    expect(await run(['--json'])).toEqual({ code: 2, out: '', err: USAGE });
  });

  it('exits 2 for an unknown option, with the usage last on stderr', () => withDir(async (root) => {
    const r = await run(['--jsn', root]);
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(r.err.endsWith(USAGE)).toBe(true);
    expect(r.err.length).toBeGreaterThan(USAGE.length);
  }));

  it('rejects a --min-size that is not a non-negative integer', () => withDir(async (root) => {
    const message = 'find-dupes: --min-size must be a non-negative integer\n';
    for (const argv of [['--min-size=-1', root], ['--min-size', '1.5', root], ['--min-size', 'abc', root], ['--min-size=', root], ['--min-size=1e3', root]]) {
      const r = await run(argv);
      expect({ argv, ...r }).toEqual({ argv, code: 2, out: '', err: message + USAGE });
    }
  }));

  it('--help prints the usage on stdout and exits 0', async () => {
    expect(await run(['--help'])).toEqual({ code: 0, out: USAGE, err: '' });
  });
});
