/**
 * Sandbox guard rails. Every case states what the grader must conclude, so a
 * regression in the harness, the trust boundary or an environment turns a
 * row red. Run with `npm run test:sandbox`.
 *
 *   npx tsx scripts/smoke.ts            all cases
 *   npx tsx scripts/smoke.ts forge      only cases whose label contains "forge"
 */
import { runExercise, sweepRunsDir, type RunRequest, type RunResult } from '../server/runner/index.ts';

interface Expect {
  ok: boolean;
  phase?: string;
  timedOut?: boolean;
  /** These test names must be present and failing. */
  failing?: string[];
  /** These test names must be present and passing. */
  passing?: string[];
  /** Every test row must fail (the equality table). */
  allFail?: boolean;
  /** Exact number of rows. */
  rows?: number;
  /** Wall time after `ready` (boot excluded: it is not the learner's and the machine may be loaded). */
  maxMsAfterReady?: number;
  resultBytesUnder?: number;
  /** Must match `error` (or, when absent, some row's error). */
  errorMatch?: RegExp;
  score?: string;
  stage?: string;
  /** Anything else: return a complaint, or null. */
  custom?: (r: RunResult) => string | null;
}

interface Case { label: string; req: RunRequest; expect: Expect; repeat?: number }

const ADD_WRONG = `export const add = (a, b) => a - b;`;
const ADD_TESTS = `it('adds', () => { expect(solution.add(2, 3)).toBe(5); });`;

const cases: Case[] = [
  /* ------------------------------------------------------------ basics */
  { label: 'js pass', req: { kind: 'js', code: `export const add = (a, b) => a + b;`, tests: ADD_TESTS }, expect: { ok: true, rows: 1 } },
  {
    label: 'js fail reports a readable diff',
    req: { kind: 'js', code: ADD_WRONG, tests: ADD_TESTS },
    expect: { ok: false, failing: ['adds'], errorMatch: /expected -1 to be 5/ },
  },
  {
    label: 'ts transpile + async',
    req: {
      kind: 'ts',
      code: `export async function fetchTwice(fn: () => Promise<number>): Promise<number> {
  const [a, b] = await Promise.all([fn(), fn()]);
  return a + b;
}`,
      tests: `it('runs in parallel', async () => {
  let calls = 0;
  const r = await solution.fetchTwice(async () => { calls++; return 21; });
  expect(r).toBe(42);
  expect(calls).toBe(2);
});`,
    },
    expect: { ok: true },
  },
  {
    label: 'typecheck pass',
    req: {
      kind: 'typecheck',
      code: `export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  throw new Error(r.error);
}`,
      tests: `import { unwrap } from './solution';
type A = Expect<Equal<ReturnType<typeof unwrap<number>>, number>>;`,
    },
    expect: { ok: true },
  },
  { label: 'typecheck fail', req: { kind: 'typecheck', code: `export const n: number = "not a number";`, tests: `` }, expect: { ok: false, errorMatch: /not assignable/ } },
  {
    label: 'typecheck: @ts-nocheck in the learner file is refused',
    req: { kind: 'typecheck', code: `// @ts-nocheck\nexport function f(x: string): number { return x; }`, tests: `` },
    expect: { ok: false, errorMatch: /switches the type checker off/ },
  },
  {
    label: 'typecheck: no ambient Node types in the program',
    req: { kind: 'typecheck', code: `export const b = Buffer.from('x');`, tests: `` },
    expect: { ok: false, errorMatch: /Cannot find name 'Buffer'/ },
  },
  {
    label: 'react hook + event',
    req: {
      kind: 'react',
      code: `import { useState } from 'react';
export function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>count: {n}</button>;
}`,
      tests: `it('increments on click', () => {
  render(<solution.Counter />);
  const btn = screen.getByRole('button');
  expect(btn.textContent).toBe('count: 0');
  fireEvent.click(btn);
  expect(btn.textContent).toBe('count: 1');
});`,
    },
    expect: { ok: true },
  },
  {
    label: 'react: dispatchEvent(new Event(x)) uses the DOM realm; storage resets between tests',
    req: {
      kind: 'react',
      code: `export const Box = () => <div data-testid="box" />;`,
      tests: `it('dispatches a global Event into jsdom', () => {
  render(<solution.Box />);
  let seen = 0;
  const el = screen.getByTestId('box');
  el.addEventListener('x', () => { seen++; });
  el.dispatchEvent(new Event('x'));
  el.dispatchEvent(new CustomEvent('x', { detail: 1 }));
  expect(seen).toBe(2);
  localStorage.setItem('k', 'v');
});
it('starts with clean storage', () => {
  expect(localStorage.getItem('k')).toBe(null);
});
it('fetch still accepts an AbortController signal', async () => {
  const c = new AbortController();
  c.abort();
  await expect(fetch('http://127.0.0.1:9/', { signal: c.signal })).rejects.toThrow(/abort/i);
});`,
    },
    expect: { ok: true, rows: 3 },
  },
  {
    label: 'sql query',
    req: {
      kind: 'sql',
      fixtures: `create table users (id serial primary key, name text, plan text);
insert into users (name, plan) values ('ada','pro'), ('bob','free'), ('cy','pro');`,
      code: `select name from users where plan = 'pro' order by name;`,
      tests: `it('returns the two pro users', async () => {
  expect(await queryUser()).toEqual([{ name: 'ada' }, { name: 'cy' }]);
});
it('count via grader query', async () => {
  const rows = await q('select count(*)::int as c from users');
  expect(num(rows[0].c)).toBe(3);
});
it('multi-statement q returns the last result', async () => {
  const rows = await q('select 1 as a; select 2 as b');
  expect(rows).toEqual([{ b: 2 }]);
});`,
    },
    expect: { ok: true, rows: 3 },
  },
  {
    label: 'node http server',
    req: {
      kind: 'node',
      code: `import http from 'node:http';
export function createApp() {
  return http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ path: req.url }));
  });
}`,
      tests: `it('serves json', async () => {
  const server = solution.createApp();
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  const res = await fetch('http://127.0.0.1:' + port + '/hello');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ path: '/hello' });
  await new Promise((r) => server.close(r));
});`,
    },
    expect: { ok: true },
  },
  {
    label: 'infinite loop at load is killed and scored',
    req: { kind: 'js', code: `export const spin = () => { while (true) {} };\nspin();`, tests: `it('never runs', () => {});`, timeoutMs: 4_000 },
    expect: { ok: false, timedOut: true, custom: (r) => (r.ready ? null : 'expected ready: true (the learner was on the clock)') },
  },
  {
    label: 'syntax error is explained',
    req: { kind: 'js', code: `export const oops = (a, b) => { return a + }`, tests: `it('never runs', () => {});` },
    expect: { ok: false, phase: 'compile' },
  },

  /* ---------------------------------------------------------- forgeries */
  {
    label: 'forge F1: overwrite globalThis.expect',
    req: { kind: 'js', code: `try { globalThis.expect = () => new Proxy({}, { get: () => () => {} }); } catch {}\n${ADD_WRONG}`, tests: ADD_TESTS },
    expect: { ok: false, failing: ['adds'] },
  },
  {
    label: 'forge F2: post a result on parentPort',
    req: {
      kind: 'js',
      code: `import { parentPort } from 'node:worker_threads';
parentPort.postMessage({ ok: true, tests: [{ name: 'forged', passed: true }], logs: [] });
${ADD_WRONG}`,
      tests: ADD_TESTS,
    },
    expect: { ok: false, phase: 'load', errorMatch: /not available in graded code/ },
  },
  {
    label: 'forge F3: patch Array.prototype.every (and friends)',
    req: {
      kind: 'js',
      code: `Array.prototype.every = () => true; Array.prototype.some = () => false; Object.keys = () => [];\n${ADD_WRONG}`,
      tests: ADD_TESTS + `\nit('deep', () => { expect({ a: 1 }).toEqual({ a: 2 }); });`,
    },
    expect: { ok: false, failing: ['adds', 'deep'] },
  },
  {
    label: 'forge F4: wrap globalThis.it',
    req: {
      kind: 'js',
      code: `const real = globalThis.it; try { globalThis.it = (n, fn) => real(n, () => {}); } catch {}\n${ADD_WRONG}`,
      tests: ADD_TESTS,
    },
    expect: { ok: false, failing: ['adds'] },
  },
  {
    label: 'forge F5: postMessage(null) cannot crash the parent',
    req: {
      kind: 'js',
      code: `const wt = await import('node:worker_threads').catch(() => null);
if (wt) { wt.parentPort.postMessage(null); wt.parentPort.postMessage(undefined); wt.parentPort.postMessage('x'); }
${ADD_WRONG}`,
      tests: ADD_TESTS,
    },
    expect: { ok: false, failing: ['adds'] },
  },
  {
    label: 'forge F6: matcher objects are frozen',
    req: {
      kind: 'js',
      code: `try { const m = expect(1); Object.getPrototypeOf(m).toBe = () => {}; } catch {}
try { const m = expect(1); m.toBe = () => {}; } catch {}
${ADD_WRONG}`,
      tests: ADD_TESTS,
    },
    expect: { ok: false, failing: ['adds'] },
  },
  {
    label: 'forge F7: workerData is scrubbed and getBuiltinModule is locked',
    req: {
      kind: 'js',
      code: `let leaked = 'none';
try { leaked = String(process.getBuiltinModule('worker_threads').workerData.tests); } catch (e) { leaked = 'blocked'; }
export const leak = () => leaked;`,
      tests: `it('cannot read the grader', () => { expect(solution.leak()).toBe('blocked'); });`,
    },
    expect: { ok: true },
  },
  {
    label: 'import policy: child_process and the curriculum source are off limits',
    req: {
      kind: 'js',
      code: `export const tries = async () => {
  const out = [];
  for (const spec of ['node:child_process', 'node:vm', 'node:module', '../../../content/index.ts', '../../../server/progress.ts']) {
    try { await import(spec); out.push(spec + ': loaded'); } catch (e) { out.push(spec + ': ' + (/not available/.test(e.message) ? 'blocked' : e.message)); }
  }
  return out;
};`,
      tests: `it('blocks all of them', async () => {
  const r = await solution.tries();
  expect(r.every((line) => line.endsWith(': blocked'))).toBe(true);
});`,
    },
    expect: { ok: true },
  },
  {
    label: 'process.exit(0) at load answers fast',
    req: { kind: 'js', code: `process.exit(0);`, tests: ADD_TESTS },
    expect: { ok: false, phase: 'exit', maxMsAfterReady: 2_000 },
  },
  {
    label: 'process.exit(0) inside a test fails only that test',
    req: {
      kind: 'js',
      code: `export const quit = () => process.exit(0);`,
      tests: `it('quits', () => { solution.quit(); });\nit('still runs', () => { expect(1).toBe(1); });`,
    },
    expect: { ok: false, failing: ['quits'], passing: ['still runs'], maxMsAfterReady: 2_000 },
  },

  /* -------------------------------------------------------- equality */
  {
    label: 'equality table: every row must fail',
    req: {
      kind: 'js',
      code: `export {};`,
      tests: `
it('Map vs {}', () => { expect(new Map([[1, 2]])).toEqual({}); });
it('Map vs Set', () => { expect(new Map()).toEqual(new Set()); });
it('regex source', () => { expect(/a/).toEqual(/b/); });
it('regex flags', () => { expect(/a/g).toEqual(/a/i); });
it('Error message', () => { expect(new Error('a')).toEqual(new Error('b')); });
it('two URLs', () => { expect(new URL('http://a/')).toEqual(new URL('http://b/')); });
it('toMatchObject with two Dates', () => { expect({ at: new Date(0) }).toMatchObject({ at: new Date(1) }); });
it('Set non-bijection', () => { expect(new Set([{ a: 1 }, { a: 1 }])).toEqual(new Set([{ a: 1 }, { a: 2 }])); });
it('[0n] vs [""]', () => { expect([0n]).toEqual(['']); });
it('1n vs "1"', () => { expect(1n).toEqual('1'); });
it('symbol keys', () => { const s = Symbol('s'); expect({ [s]: 1 }).toEqual({ [s]: 2 }); });
it('class vs plain under toStrictEqual', () => { class P { constructor() { this.x = 1; } } expect(new P()).toStrictEqual({ x: 1 }); });
it('undefined key under toStrictEqual', () => { expect({ a: 1, b: undefined }).toStrictEqual({ a: 1 }); });
it('-0 under toStrictEqual', () => { expect(-0).toStrictEqual(0); });
it('two different Headers', () => { expect(new Headers({ a: '1' })).toEqual(new Headers({ b: '2' })); });
it('two different URLSearchParams', () => { expect(new URLSearchParams('a=1')).toEqual(new URLSearchParams('a=2')); });
it('two Blobs cannot be compared structurally', () => { expect(new Blob(['a'])).toEqual(new Blob(['b'])); });
it('typed arrays by bytes', () => { expect(new Uint8Array([1, 2])).toEqual(new Uint8Array([1, 3])); });
it('different cyclic structures', () => { const a = { n: 1 }; a.self = a; const b = { n: 2 }; b.self = b; expect(a).toEqual(b); });
it('array vs object', () => { expect([1]).toEqual({ 0: 1 }); });
it('toBe tells -0 from 0', () => { expect(-0).toBe(0); });
it('toThrow({ status: 400 }) on a different error', () => { expect(() => { throw new Error('other'); }).toThrow({ status: 400 }); });
it('async function under not.toThrow', () => { expect(async () => { throw new Error('x'); }).not.toThrow(); });
it('un-awaited .rejects on a resolving promise', () => { expect(Promise.resolve(1)).rejects.toThrow(); });
it('a late assertion in a timer', () => { setTimeout(() => expect(1).toBe(2), 0); });
it('registering a test while running', () => { it('ghost', () => {}); });
describe('scoped', () => { afterEach(() => { expect(1).toBe(2); }); it('inner', () => {}); });
`,
    },
    expect: {
      ok: false,
      custom: (r) => {
        const passed = r.tests.filter((t) => t.passed).map((t) => t.name);
        const blob = r.tests.find((t) => t.name === 'two Blobs cannot be compared structurally');
        const minus = r.tests.find((t) => t.name === 'toBe tells -0 from 0');
        if (passed.length) return `these should have failed: ${passed.join(', ')}`;
        if (!/cannot structurally compare two Blob/.test(blob?.error ?? '')) return `Blob row should explain itself, got: ${blob?.error}`;
        if (!/-0/.test(minus?.error ?? '')) return `-0 should be visible in the message, got: ${minus?.error}`;
        if (r.tests.some((t) => /Maximum call stack/.test(t.error ?? ''))) return 'a cyclic comparison overflowed the stack';
        return null;
      },
    },
  },
  {
    label: 'equality: the lenient toEqual rules hold',
    req: {
      kind: 'js',
      code: `export {};`,
      tests: `
it('undefined keys are ignored', () => { expect({ a: 1, b: undefined }).toEqual({ a: 1 }); });
it('-0 equals 0', () => { expect(-0).toEqual(0); });
it('integer bigint equals number', () => { expect({ n: 1n }).toEqual({ n: 1 }); });
it('same cyclic structures', () => { const a = { n: 1 }; a.self = a; const b = { n: 1 }; b.self = b; expect(a).toEqual(b); });
it('class vs plain under toEqual', () => { class P { constructor() { this.x = 1; } } expect(new P()).toEqual({ x: 1 }); });
it('Maps by entries', () => { expect(new Map([['a', { x: 1 }]])).toEqual(new Map([['a', { x: 1 }]])); });
it('Sets by bijection', () => { expect(new Set([{ a: 1 }, { a: 2 }])).toEqual(new Set([{ a: 2 }, { a: 1 }])); });
it('Headers by entries', () => { expect(new Headers({ a: '1' })).toEqual(new Headers({ a: '1' })); });
it('Error with code', () => { const e = Object.assign(new Error('x'), { code: 'E' }); expect(e).toEqual(Object.assign(new Error('x'), { code: 'E' })); });
it('holes read as undefined', () => { expect([, 1]).toEqual([undefined, 1]); });
it('toMatchObject ignores extra keys', () => { expect({ a: 1, b: { c: 2, d: 3 } }).toMatchObject({ b: { c: 2 } }); });
it('toMatchObject undefined means absent or undefined', () => { expect({ a: 1 }).toMatchObject({ b: undefined }); });
it('toThrow with an object', () => { expect(() => { throw Object.assign(new Error('bad'), { status: 400 }); }).toThrow({ status: 400 }); });
it('toThrow with an Error instance', () => { expect(() => { throw new Error('bad'); }).toThrow(new Error('bad')); });
it('rejects with a matcher', async () => { await expect(Promise.reject(Object.assign(new Error('x'), { status: 404 }))).rejects.toMatchObject({ status: 404 }); });
it('resolves.not', async () => { await expect(Promise.resolve(1)).resolves.not.toBe(2); });
it('getters run as often as the test reads them', () => { let n = 0; const o = { get x() { return ++n; } }; expect(o).toBeDefined(); expect(n).toBe(0); });
it('beforeAll/afterAll exist', () => { expect(typeof beforeAll).toBe('function'); expect(typeof afterAll).toBe('function'); });
`,
    },
    expect: { ok: true, rows: 18 },
  },
  {
    label: 'async describe is refused at load (lesson bug)',
    req: { kind: 'js', code: `export {};`, tests: `describe('x', async () => { it('a', () => {}); });` },
    expect: { ok: false, phase: 'grader', errorMatch: /describe callbacks must be synchronous/ },
  },

  /* --------------------------------------------------------- timeouts */
  {
    label: 'a hung test after 3 passes keeps 3 rows',
    req: {
      kind: 'js',
      code: `export const spin = () => { while (true) {} };`,
      tests: `it('one', () => {}); it('two', () => {}); it('three', () => {});
it('hangs', () => { solution.spin(); });
it('after', () => {});`,
      timeoutMs: 4_000,
    },
    expect: {
      ok: false,
      timedOut: true,
      passing: ['one', 'two', 'three'],
      failing: ['hangs', 'after'],
      rows: 5,
      custom: (r) => {
        const hang = r.tests.find((t) => t.name === 'hangs');
        const after = r.tests.find((t) => t.name === 'after');
        if (!hang?.timedOut) return 'the in-flight test should be marked timedOut';
        if (after?.error !== 'not run') return `later tests should be "not run", got ${after?.error}`;
        return null;
      },
    },
  },
  {
    label: 'an await that never settles fails its own test only (per-test timeout)',
    req: {
      kind: 'js',
      code: `export const never = () => new Promise(() => {});`,
      tests: `it('waits forever', async () => { await solution.never(); });\nit('next', () => { expect(1).toBe(1); });`,
      testTimeoutMs: 300,
    },
    expect: { ok: false, failing: ['waits forever'], passing: ['next'], errorMatch: /timed out after 0\.3 s/ },
  },
  {
    label: 'AbortSignal.timeout fires (heartbeat)',
    req: {
      kind: 'js',
      code: `export const wait = (ms) => new Promise((resolve) => AbortSignal.timeout(ms).addEventListener('abort', () => resolve('aborted')));`,
      tests: `it('fires', async () => { expect(await solution.wait(150)).toBe('aborted'); });`,
    },
    expect: { ok: true },
  },
  {
    label: 'dynamic import() under a tsx parent never hangs',
    repeat: 5,
    req: {
      kind: 'js',
      code: `export const sep = async () => (await import('node:path')).sep;`,
      tests: `it('imports', async () => { const { basename } = await import('node:path'); expect(basename('/a/b')).toBe('b'); expect(typeof (await solution.sep())).toBe('string'); });`,
    },
    expect: { ok: true },
  },

  /* ----------------------------------------------------------- output */
  {
    label: 'a 5 MB log produces a small result',
    req: {
      kind: 'js',
      code: `console.error(new Error('boom')); console.log('x'.repeat(5e6)); for (let i = 0; i < 1000; i++) console.log('line ' + i); process.stdout.write('direct write');\nexport {};`,
      tests: `it('runs', () => { expect(1).toBe(1); });`,
    },
    expect: {
      ok: true,
      resultBytesUnder: 100_000,
      custom: (r) => {
        if (!r.logs.some((l) => /Error: boom/.test(l.text))) return 'console.error(err) should print the error, not {}';
        if (!r.logs.some((l) => /not shown/.test(l.text))) return 'dropped log entries should be counted';
        return null;
      },
    },
  },

  /* -------------------------------------------------------------- sql */
  {
    label: 'sql: learner BEGIN without COMMIT',
    req: {
      kind: 'sql',
      fixtures: `create table t0 (id int);`,
      code: `begin; create table t (id int primary key);`,
      tests: `it('one', async () => { await q('select * from t'); });`,
    },
    expect: { ok: false, phase: 'load', errorMatch: /BEGIN but never COMMITs/ },
  },
  {
    label: 'sql: a test that commits is caught, and the next test is isolated',
    req: {
      kind: 'sql',
      fixtures: `create table t (id int);`,
      code: `select 1;`,
      tests: `it('commits', async () => { await db.exec('insert into t values (1); commit'); });
it('isolated', async () => { await db.exec('insert into t values (2)'); expect((await q('select count(*)::int as c from t'))[0].c).toBe(2); });`,
    },
    expect: {
      ok: false,
      phase: 'grader',
      failing: ['commits'],
      custom: (r) => (/ended the grading transaction/.test(r.tests[0]?.error ?? '') ? null : `unexpected message: ${r.tests[0]?.error}`),
    },
  },

  /* ---------------------------------------------------------- node-db */
  {
    label: 'node-db: learner module uses the db global; a spy counts round trips',
    req: {
      kind: 'node-db',
      fixtures: `create table users (id serial primary key, name text not null);
insert into users (name) values ('ada'), ('bob');`,
      code: `export async function names(conn = db) {
  const r = await conn.query('select name from users order by id');
  return r.rows.map((row) => row.name);
}
export async function rename(conn, id, name) {
  await conn.query('begin');
  try {
    await conn.query('update users set name = $1 where id = $2', [name, id]);
    await conn.query('commit');
  } catch (e) { await conn.query('rollback'); throw e; }
}`,
      tests: `it('reads through the global', async () => {
  expect(await solution.names()).toEqual(['ada', 'bob']);
});
it('one round trip, parameters used', async () => {
  const calls = [];
  const spy = { query: (sql, params) => { calls.push([sql, params]); return db.query(sql, params); } };
  await solution.rename(spy, 1, 'ada lovelace');
  expect(calls.filter(([sql]) => /update/i.test(sql))).toHaveLength(1);
  expect(calls.find(([sql]) => /update/i.test(sql))[1]).toEqual(['ada lovelace', 1]);
  expect(await solution.names()).toEqual(['ada lovelace', 'bob']);
});`,
    },
    expect: { ok: true, rows: 2 },
  },

  /* --------------------------------------------------------- mutation */
  ...mutationCases(),
];

function mutationCases(): Case[] {
  const subject = `export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));`;
  const mutants = [
    { label: 'ignores the upper bound', code: `export const clamp = (n, lo, hi) => Math.max(lo, n);` },
    { label: 'ignores the lower bound', code: `export const clamp = (n, lo, hi) => Math.min(hi, n);` },
  ];
  const equivalents = [`export function clamp(n, lo, hi) { if (n < lo) return lo; if (n > hi) return hi; return n; }`];
  const base = { kind: 'mutation' as const, subject, mutants, equivalents };
  return [
    {
      label: 'mutation: tests that catch both mutants and pass the equivalent',
      req: {
        ...base,
        code: `it('below', () => { expect(subject.clamp(-5, 0, 10)).toBe(0); });
it('above', () => { expect(solution.clamp(50, 0, 10)).toBe(10); });
it('within', () => { expect(subject.clamp(5, 0, 10)).toBe(5); });`,
      },
      expect: { ok: true, rows: 4, score: '2/2', stage: 'done' },
    },
    {
      label: 'mutation: tests that miss the upper bound',
      req: {
        ...base,
        code: `it('below', () => { expect(subject.clamp(-5, 0, 10)).toBe(0); });
it('within', () => { expect(subject.clamp(5, 0, 10)).toBe(5); });
it('at the bottom', () => { expect(subject.clamp(0, 0, 10)).toBe(0); });`,
      },
      expect: { ok: false, failing: ['catches: ignores the upper bound'], passing: ['catches: ignores the lower bound'], score: '1/2', stage: 'mutants' },
    },
    {
      label: 'mutation: tests that assert nothing do not pass the correct implementation',
      req: { ...base, code: `it('a', () => {}); it('b', () => {}); it('c', () => { subject.clamp(1, 0, 2); });` },
      expect: { ok: false, failing: ['passes against a correct implementation'], errorMatch: /asserts nothing/, stage: 'correct' },
    },
    {
      label: 'mutation: a mutant that hangs is killed by timeout and the rest still run',
      req: {
        ...base,
        mutants: [...mutants, { label: 'loops on large input', code: `export const clamp = (n, lo, hi) => { while (n > hi) {} return Math.max(lo, n); };` }],
        timeoutMs: 4_000,
        code: `it('below', () => { expect(subject.clamp(-5, 0, 10)).toBe(0); });
it('above', () => { expect(subject.clamp(50, 0, 10)).toBe(10); });
it('within', () => { expect(subject.clamp(5, 0, 10)).toBe(5); });`,
      },
      expect: { ok: true, rows: 5, score: '3/3' },
    },
    {
      label: 'mutation: react subject',
      req: {
        kind: 'mutation',
        subjectKind: 'react',
        subject: `import { useState } from 'react';
export function Counter({ start = 0 }) {
  const [n, setN] = useState(start);
  return <button onClick={() => setN(n + 1)}>count: {n}</button>;
}`,
        mutants: [
          { label: 'ignores start', code: `import { useState } from 'react';\nexport function Counter() { const [n, setN] = useState(0); return <button onClick={() => setN(n + 1)}>count: {n}</button>; }` },
          { label: 'increments twice', code: `import { useState } from 'react';\nexport function Counter({ start = 0 }) { const [n, setN] = useState(start); return <button onClick={() => setN(n + 2)}>count: {n}</button>; }` },
        ],
        equivalents: [`import { useReducer } from 'react';\nexport function Counter({ start = 0 }) { const [n, inc] = useReducer((x) => x + 1, start); return <button onClick={inc}>count: {n}</button>; }`],
        code: `it('starts at start', () => { render(<subject.Counter start={3} />); expect(screen.getByRole('button').textContent).toBe('count: 3'); });
it('counts one per click', () => { render(<subject.Counter />); fireEvent.click(screen.getByRole('button')); expect(screen.getByRole('button').textContent).toBe('count: 1'); });
it('defaults to zero', () => { render(<subject.Counter />); expect(screen.getByRole('button').textContent).toBe('count: 0'); });`,
      },
      expect: { ok: true, rows: 4, score: '2/2' },
    },
  ];
}

/* ------------------------------------------------------------- runner */

function judge(r: RunResult, e: Expect): string[] {
  const problems: string[] = [];
  const row = (name: string) => r.tests.find((t) => t.name === name);
  if (r.ok !== e.ok) problems.push(`ok=${r.ok}, expected ${e.ok}`);
  if (e.phase !== undefined && r.phase !== e.phase) problems.push(`phase=${r.phase}, expected ${e.phase}`);
  if (e.timedOut !== undefined && !!r.timedOut !== e.timedOut) problems.push(`timedOut=${!!r.timedOut}, expected ${e.timedOut}`);
  for (const n of e.failing ?? []) if (!row(n) || row(n)!.passed) problems.push(`"${n}" should be present and failing`);
  for (const n of e.passing ?? []) if (!row(n) || !row(n)!.passed) problems.push(`"${n}" should be present and passing (${row(n)?.error ?? 'missing'})`);
  if (e.allFail && r.tests.some((t) => t.passed)) problems.push(`rows passed that should fail: ${r.tests.filter((t) => t.passed).map((t) => t.name).join(', ')}`);
  if (e.rows !== undefined && r.tests.length !== e.rows) problems.push(`${r.tests.length} rows, expected ${e.rows}`);
  if (e.maxMsAfterReady !== undefined) {
    const after = r.ms - (r.bootMs ?? 0);
    if (after > e.maxMsAfterReady) problems.push(`took ${after}ms after ready, limit ${e.maxMsAfterReady}ms`);
  }
  if (e.resultBytesUnder !== undefined) {
    const size = JSON.stringify(r).length;
    if (size >= e.resultBytesUnder) problems.push(`result is ${size} bytes, limit ${e.resultBytesUnder}`);
  }
  if (e.errorMatch) {
    const text = r.error ?? r.tests.map((t) => t.error ?? '').join('\n');
    if (!e.errorMatch.test(text)) problems.push(`error should match ${e.errorMatch}, got: ${text.split('\n').slice(0, 3).join(' / ')}`);
  }
  if (e.score !== undefined && r.mutation?.score !== e.score) problems.push(`score=${r.mutation?.score}, expected ${e.score}`);
  if (e.stage !== undefined && r.mutation?.stage !== e.stage) problems.push(`stage=${r.mutation?.stage}, expected ${e.stage}`);
  if (e.custom) {
    const c = e.custom(r);
    if (c) problems.push(c);
  }
  return problems;
}

const filter = process.argv[2];
let failures = 0;
let ran = 0;
for (const c of cases) {
  if (filter && !c.label.includes(filter)) continue;
  for (let i = 0; i < (c.repeat ?? 1); i++) {
    ran++;
    const r = await runExercise(c.req);
    const problems = judge(r, c.expect);
    const label = c.repeat ? `${c.label} (${i + 1}/${c.repeat})` : c.label;
    const summary = r.error
      ? `error: ${r.error.split('\n')[0]}`
      : r.tests.map((t) => `${t.passed ? '✓' : '✗'} ${t.name}`).join(' | ');
    console.log(`${problems.length ? 'FAIL' : 'ok  '} [${label}] ok=${r.ok} ${r.ms}ms (boot ${r.bootMs ?? '-'}ms)${r.timedOut ? ' TIMEOUT' : ''}`);
    if (problems.length) {
      failures++;
      console.log(`       ${summary.slice(0, 400)}`);
      for (const p of problems) console.log(`       !! ${p}`);
    }
  }
}

// The parent must have survived everything above without a safety net.
if (process.listenerCount('uncaughtException') !== 0) {
  failures++;
  console.log('FAIL the parent installed an uncaughtException handler; it must not need one');
}
console.log(failures ? `\n${failures} of ${ran} checks failed` : `\nall ${ran} checks passed`);
await sweepRunsDir();
process.exit(failures ? 1 : 0);
