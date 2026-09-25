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

/** Runs fn(dir) with a fresh temp directory that is always removed. */
const withDir = async (fn) => {
  const dir = await mkdtemp(path.join(await tmpBase(), 'cfg-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const settle = (p) => p.then((value) => ({ value }), (error) => ({ error }));

describe('loadConfig', () => {
  it('returns the defaults when the file does not exist', () => withDir(async (dir) => {
    const cfg = await solution.loadConfig(path.join(dir, 'missing.json'), { port: 3000 });
    expect(cfg).toEqual({ port: 3000 });
  }));

  it('returns a copy of the defaults, not the same object', () => withDir(async (dir) => {
    const defaults = { port: 3000 };
    const cfg = await solution.loadConfig(path.join(dir, 'missing.json'), defaults);
    cfg.port = 1;
    expect(defaults.port).toBe(3000);
  }));

  it('merges the file over the defaults', () => withDir(async (dir) => {
    const file = path.join(dir, 'app.json');
    await writeFile(file, JSON.stringify({ port: 8080, debug: true }));
    const defaults = { port: 3000, host: 'localhost' };
    const cfg = await solution.loadConfig(file, defaults);
    expect(cfg).toEqual({ port: 8080, host: 'localhost', debug: true });
    expect(defaults).toEqual({ port: 3000, host: 'localhost' });
  }));

  it('strips a UTF-8 byte-order mark', () => withDir(async (dir) => {
    const file = path.join(dir, 'bom.json');
    await writeFile(file, '﻿{"port":9000}');
    expect(await solution.loadConfig(file, {})).toEqual({ port: 9000 });
  }));

  it('rejects invalid JSON with a ConfigError naming the file', () => withDir(async (dir) => {
    const file = path.join(dir, 'broken.json');
    await writeFile(file, '{"port": 8080,}');
    const { error } = await settle(solution.loadConfig(file, { port: 3000 }));
    expect(error).toBeInstanceOf(solution.ConfigError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ConfigError');
    expect(error.path).toBe(file);
    expect(error.message).toContain(file);
    expect(error.cause).toBeInstanceOf(SyntaxError);
  }));

  it('rejects an empty file', () => withDir(async (dir) => {
    const file = path.join(dir, 'empty.json');
    await writeFile(file, '');
    const { error } = await settle(solution.loadConfig(file, {}));
    expect(error).toBeInstanceOf(solution.ConfigError);
  }));

  for (const [label, text] of [['an array', '[1,2]'], ['null', 'null'], ['a number', '42'], ['a string', '"port"']]) {
    it(`rejects ${label} with a ConfigError`, () => withDir(async (dir) => {
      const file = path.join(dir, 'odd.json');
      await writeFile(file, text);
      const { error } = await settle(solution.loadConfig(file, {}));
      expect(error).toBeInstanceOf(solution.ConfigError);
      expect(error.path).toBe(file);
      expect(error.message).toContain(file);
    }));
  }

  it('lets other fs errors through unchanged (a directory is not a missing file)', () => withDir(async (dir) => {
    const sub = path.join(dir, 'config.json');
    await mkdir(sub);
    const { error, value } = await settle(solution.loadConfig(sub, { port: 3000 }));
    expect(value).toBeUndefined();
    expect(error).toBeDefined();
    expect(error.code).toBe('EISDIR');
    expect(error instanceof solution.ConfigError).toBe(false);
  }));

  it('reads the file fresh on every call', () => withDir(async (dir) => {
    const file = path.join(dir, 'app.json');
    await writeFile(file, '{"v":1}');
    expect(await solution.loadConfig(file, {})).toEqual({ v: 1 });
    await writeFile(file, '{"v":2}');
    expect(await solution.loadConfig(file, {})).toEqual({ v: 2 });
  }));
});
