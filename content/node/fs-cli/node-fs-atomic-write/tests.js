import { access, mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
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
  const dir = await mkdtemp(path.join(await tmpBase(), 'atomic-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const settle = (p) => p.then((value) => ({ value }), (error) => ({ error }));

/** A promise the test opens by hand. */
const gate = () => {
  let open;
  const promise = new Promise((r) => { open = r; });
  return { promise, open };
};

/** Yields the first part, waits for the gate, then yields the rest (or throws). */
async function* paused(parts, g, failWith) {
  yield parts[0];
  await g.promise;
  if (failWith) throw failWith;
  for (const part of parts.slice(1)) yield part;
}

/**
 * Bounded poll: waits for something that happens on another event. Gives up
 * at once if the write being watched has already settled (it cannot happen
 * any more), so a broken implementation fails fast instead of timing out.
 */
const until = async (cond, ms = 3000, watched = null) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end || (watched && watched.settled)) return false;
    await new Promise((r) => setTimeout(r, 10));
  }
  return true;
};

/** Wraps a promise and records when it settles. */
const watch = (promise) => {
  const w = { settled: false };
  w.promise = promise.then(
    (value) => { w.settled = true; return value; },
    (error) => { w.settled = true; throw error; },
  );
  w.promise.catch(() => {});
  return w;
};

describe('writeFileAtomic', () => {
  it('writes a new file', () => withDir(async (dir) => {
    const file = path.join(dir, 'state.json');
    const result = await solution.writeFileAtomic(file, '{"a":1}');
    expect(result).toBeUndefined();
    expect(await readFile(file, 'utf8')).toBe('{"a":1}');
  }));

  it('replaces an existing file and leaves nothing else behind', () => withDir(async (dir) => {
    const file = path.join(dir, 'state.json');
    await writeFile(file, 'old contents that are longer than the new ones');
    await solution.writeFileAtomic(file, Buffer.from('new'));
    expect(await readFile(file, 'utf8')).toBe('new');
    expect(await readdir(dir)).toEqual(['state.json']);
  }));

  it('accepts an async iterable of chunks', () => withDir(async (dir) => {
    const file = path.join(dir, 'out.txt');
    async function* gen() { yield 'a,'; yield Buffer.from('b,'); yield 'c'; }
    await solution.writeFileAtomic(file, gen());
    expect(await readFile(file, 'utf8')).toBe('a,b,c');
  }));

  it('keeps the old contents visible while the write is in progress, via a temp file in the same directory', () => withDir(async (dir) => {
    const file = path.join(dir, 'state.json');
    await writeFile(file, 'OLD');
    const g = gate();
    const w = watch(solution.writeFileAtomic(file, paused(['NEW-1 ', 'NEW-2'], g)));
    const sawTemp = await until(async () => (await readdir(dir)).length === 2, 3000, w);
    try {
      expect(sawTemp).toBe(true); // a second entry appeared next to the target
      expect(await readFile(file, 'utf8')).toBe('OLD');
    } finally {
      g.open();
      await w.promise.catch(() => {});
    }
    expect(await readFile(file, 'utf8')).toBe('NEW-1 NEW-2');
    expect(await readdir(dir)).toEqual(['state.json']);
  }));

  it('leaves the original untouched and cleans up when the data source fails', () => withDir(async (dir) => {
    const file = path.join(dir, 'state.json');
    await writeFile(file, 'OLD');
    const boom = new Error('upstream failed');
    const g = gate();
    const w = watch(solution.writeFileAtomic(file, paused(['half of the ', 'data'], g, boom)));
    await until(async () => (await readdir(dir)).length === 2, 3000, w);
    g.open();
    const { error } = await settle(w.promise);
    expect(error).toBe(boom);
    expect(await readFile(file, 'utf8')).toBe('OLD');
    expect(await readdir(dir)).toEqual(['state.json']);
  }));

  it('two overlapping writes to the same file use separate temp files', () => withDir(async (dir) => {
    const file = path.join(dir, 'state.json');
    await writeFile(file, 'OLD');
    const ga = gate();
    const gb = gate();
    const wa = watch(solution.writeFileAtomic(file, paused(['A1 ', 'A2'], ga)));
    await until(async () => (await readdir(dir)).length === 2, 3000, wa);
    const wb = watch(solution.writeFileAtomic(file, paused(['B1 ', 'B2'], gb)));
    const bothPending = await until(async () => (await readdir(dir)).length === 3, 1500, wb);
    ga.open();
    const ra = await settle(wa.promise);
    gb.open();
    const rb = await settle(wb.promise);
    expect(bothPending).toBe(true);
    expect(ra.error).toBeUndefined();
    expect(rb.error).toBeUndefined();
    expect(await readFile(file, 'utf8')).toBe('B1 B2');
    expect(await readdir(dir)).toEqual(['state.json']);
  }));

  it('rejects with the fs error when the directory does not exist', () => withDir(async (dir) => {
    const file = path.join(dir, 'nope', 'state.json');
    const { error } = await settle(solution.writeFileAtomic(file, 'x'));
    expect(error).toBeDefined();
    expect(error.code).toBe('ENOENT');
    expect(await readdir(dir)).toEqual([]);
  }));

  it('works for many sequential writes without accumulating temp files', () => withDir(async (dir) => {
    const file = path.join(dir, 'counter.txt');
    for (let i = 0; i < 10; i++) await solution.writeFileAtomic(file, String(i));
    expect(await readFile(file, 'utf8')).toBe('9');
    expect(await readdir(dir)).toEqual(['counter.txt']);
  }));
});
