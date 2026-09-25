import { access, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
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
  const dir = await mkdtemp(path.join(await tmpBase(), 'cli-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const USAGE = 'usage: count-lines [--total] <file>...\n';

/** Runs main with captured streams; fails clearly if main throws. */
const run = async (argv, stdinChunks = []) => {
  let out = '';
  let err = '';
  const io = {
    stdout: { write: (s) => { out += s; return true; } },
    stderr: { write: (s) => { err += s; return true; } },
    stdin: Readable.from(stdinChunks.map((c) => Buffer.from(c))),
  };
  let code;
  try {
    code = await solution.main(argv, io);
  } catch (e) {
    throw new Error(`main threw (${e.message}); it must resolve an exit code instead`);
  }
  return { code, out, err };
};

describe('count-lines', () => {
  it('counts lines per file, in argument order, on stdout', () => withDir(async (dir) => {
    const a = path.join(dir, 'a.txt');
    const b = path.join(dir, 'b.txt');
    await writeFile(a, 'one\ntwo\nthree\n');
    await writeFile(b, 'x\n');
    const r = await run([b, a]);
    expect(r).toEqual({ code: 0, out: `1\t${b}\n3\t${a}\n`, err: '' });
  }));

  it('counts a final line with no newline, and an empty file as 0', () => withDir(async (dir) => {
    const noEol = path.join(dir, 'no-eol.txt');
    const empty = path.join(dir, 'empty.txt');
    const blank = path.join(dir, 'blank.txt');
    await writeFile(noEol, 'a\nb');
    await writeFile(empty, '');
    await writeFile(blank, '\n\n');
    const r = await run([noEol, empty, blank]);
    expect(r.out).toBe(`2\t${noEol}\n0\t${empty}\n2\t${blank}\n`);
    expect(r.code).toBe(0);
  }));

  it('adds a total line with --total, wherever the flag appears', () => withDir(async (dir) => {
    const a = path.join(dir, 'a.txt');
    const b = path.join(dir, 'b.txt');
    await writeFile(a, '1\n2\n');
    await writeFile(b, '1\n2\n3');
    const r = await run([a, '--total', b]);
    expect(r.out).toBe(`2\t${a}\n3\t${b}\n5\ttotal\n`);
    expect(r.code).toBe(0);
  }));

  it('reports a missing file on stderr, keeps going, and exits 1', () => withDir(async (dir) => {
    const a = path.join(dir, 'a.txt');
    const missing = path.join(dir, 'missing.txt');
    const c = path.join(dir, 'c.txt');
    await writeFile(a, 'x\n');
    await writeFile(c, 'y\nz\n');
    const r = await run([a, missing, c, '--total']);
    expect(r.out).toBe(`1\t${a}\n2\t${c}\n3\ttotal\n`);
    expect(r.err).toBe(`count-lines: ${missing}: no such file\n`);
    expect(r.code).toBe(1);
  }));

  it('reports a directory argument as "is a directory"', () => withDir(async (dir) => {
    const sub = path.join(dir, 'logs');
    await mkdir(sub);
    const r = await run([sub]);
    expect(r).toEqual({ code: 1, out: '', err: `count-lines: ${sub}: is a directory\n` });
  }));

  it('reads stdin for the argument -', async () => {
    const r = await run(['-'], ['alpha\nbe', 'ta\n', 'gamma']);
    expect(r).toEqual({ code: 0, out: '3\t-\n', err: '' });
  });

  it('counts newlines that sit on chunk boundaries correctly', async () => {
    const r = await run(['-'], ['\n', 'a', '\n', '', 'b\n']);
    expect(r.out).toBe('3\t-\n');
  });

  it('exits 2 with the usage on stderr when no files are given', async () => {
    expect(await run([])).toEqual({ code: 2, out: '', err: USAGE });
    expect(await run(['--total'])).toEqual({ code: 2, out: '', err: USAGE });
  });

  it('exits 2 for an unknown option, before reading anything', () => withDir(async (dir) => {
    const a = path.join(dir, 'a.txt');
    await writeFile(a, 'x\n');
    const r = await run([a, '--totals']);
    expect(r).toEqual({ code: 2, out: '', err: `count-lines: unknown option '--totals'\n${USAGE}` });
  }));

  it('--help prints the usage on stdout and exits 0', async () => {
    expect(await run(['--help'])).toEqual({ code: 0, out: USAGE, err: '' });
  });

  it('counts a large file correctly', () => withDir(async (dir) => {
    const big = path.join(dir, 'big.log');
    await writeFile(big, 'GET /health 200\n'.repeat(200000));
    const r = await run([big]);
    expect(r.out).toBe(`200000\t${big}\n`);
  }));
});
