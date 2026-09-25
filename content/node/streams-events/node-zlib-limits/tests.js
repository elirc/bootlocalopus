import { access, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
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
  const dir = await mkdtemp(path.join(await tmpBase(), 'zlib-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const exists = (p) => access(p).then(() => true, () => false);

/**
 * `mb` MiB of zeros as `mb` concatenated gzip members (valid gzip: a
 * decompressor must read them all). About 1 KB compressed per MiB.
 */
const bomb = (mb) => {
  const member = gzipSync(Buffer.alloc(1024 * 1024), { level: 9 });
  return Buffer.concat(Array.from({ length: mb }, () => member));
};

/** Serves `buf` in fixed-size chunks and counts how many were pulled. */
const counted = (buf, size) => {
  const log = { pulled: 0, total: Math.ceil(buf.length / size) };
  const source = Readable.from((function* () {
    for (let i = 0; i < buf.length; i += size) {
      log.pulled++;
      yield buf.subarray(i, i + size);
    }
  })(), { objectMode: false, highWaterMark: size });
  return { source, log };
};

const rejection = async (promise) => {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  return null;
};

describe('gzipFile', () => {
  it('writes a valid gzip of the source file', () => withDir(async (dir) => {
    const src = path.join(dir, 'report.csv');
    const dest = path.join(dir, 'report.csv.gz');
    const text = 'id,total\n' + Array.from({ length: 20000 }, (_, i) => `${i},${i * 3}`).join('\n');
    await writeFile(src, text);
    await solution.gzipFile(src, dest);
    const gz = await readFile(dest);
    expect(gz.length).toBeLessThan(text.length);
    expect(gunzipSync(gz).toString()).toBe(text);
  }));

  it('leaves no output file behind when the source is missing', () => withDir(async (dir) => {
    const dest = path.join(dir, 'out.gz');
    const e = await rejection(solution.gzipFile(path.join(dir, 'missing.csv'), dest));
    expect(e && e.code).toBe('ENOENT');
    expect(await exists(dest)).toBe(false);
  }));

  it('rejects when the destination directory does not exist', () => withDir(async (dir) => {
    const src = path.join(dir, 'a.txt');
    await writeFile(src, 'hello');
    const e = await rejection(solution.gzipFile(src, path.join(dir, 'nope', 'a.txt.gz')));
    expect(e && e.code).toBe('ENOENT');
  }));
});

describe('gunzipLimited', () => {
  it('decompresses into one Buffer', async () => {
    const text = 'héllo wörld ☕ '.repeat(5000);
    const { source } = counted(gzipSync(text), 1000);
    const out = await solution.gunzipLimited(source, 1_000_000);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.toString()).toBe(text);
  });

  it('allows exactly maxBytes and rejects one byte more', async () => {
    const data = Buffer.alloc(50000, 7);
    const gz = gzipSync(data);
    expect((await solution.gunzipLimited(Readable.from([gz]), 50000)).length).toBe(50000);
    const e = await rejection(solution.gunzipLimited(Readable.from([gz]), 49999));
    expect(e).toBeInstanceOf(solution.TooLargeError);
    expect(e.name).toBe('TooLargeError');
    expect(e.limit).toBe(49999);
  });

  it('stops reading a decompression bomb as soon as the limit is passed', async () => {
    const gz = bomb(128); // 128 MiB of zeros, ~130 KB compressed
    const { source, log } = counted(gz, 512);
    expect(log.total).toBeGreaterThan(200);
    const e = await rejection(solution.gunzipLimited(source, 1024 * 1024));
    expect(e && e.name).toBe('TooLargeError');
    expect(log.pulled).toBeLessThan(log.total / 2);
    expect(source.destroyed).toBe(true);
  });

  it('rejects invalid gzip with zlib\'s own error', async () => {
    const e = await rejection(solution.gunzipLimited(Readable.from([Buffer.from('this is not gzip data')]), 1000));
    expect(e).toBeDefined();
    expect(e === null).toBe(false);
    expect(String(e.code)).toMatch(/^Z_/);
    expect(e instanceof solution.TooLargeError).toBe(false);
  });

  it('rejects a truncated gzip stream', async () => {
    const gz = gzipSync('x'.repeat(10000) + Math.random());
    const e = await rejection(solution.gunzipLimited(Readable.from([gz.subarray(0, gz.length - 10)]), 1e6));
    expect(e === null).toBe(false);
    expect(String(e.code)).toMatch(/^Z_/);
  });
});
