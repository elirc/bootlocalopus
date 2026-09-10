import { runExercise, sweepRunsDir } from '../server/runner/index.ts';

const cases = [
  {
    label: 'js pass',
    kind: 'js' as const,
    code: `export const add = (a, b) => a + b;`,
    tests: `it('adds', () => { expect(solution.add(2, 3)).toBe(5); });`,
  },
  {
    label: 'js fail (should report a readable diff)',
    kind: 'js' as const,
    code: `export const add = (a, b) => a - b;`,
    tests: `it('adds', () => { expect(solution.add(2, 3)).toBe(5); });`,
  },
  {
    label: 'ts transpile + async',
    kind: 'ts' as const,
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
  {
    label: 'typecheck pass',
    kind: 'typecheck' as const,
    code: `export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  throw new Error(r.error);
}`,
    tests: `import { unwrap } from './solution';
type A = Expect<Equal<ReturnType<typeof unwrap<number>>, number>>;`,
  },
  {
    label: 'typecheck fail',
    kind: 'typecheck' as const,
    code: `export const n: number = "not a number";`,
    tests: ``,
  },
  {
    label: 'react hook + event',
    kind: 'react' as const,
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
  {
    label: 'sql query',
    kind: 'sql' as const,
    fixtures: `create table users (id serial primary key, name text, plan text);
insert into users (name, plan) values ('ada','pro'), ('bob','free'), ('cy','pro');`,
    code: `select name from users where plan = 'pro' order by name;`,
    tests: `it('returns the two pro users', async () => {
  const rows = await queryUser();
  expect(rows).toEqual([{ name: 'ada' }, { name: 'cy' }]);
});
it('count via grader query', async () => {
  const rows = await q('select count(*)::int as c from users');
  expect(num(rows[0].c)).toBe(3);
});`,
  },
  {
    label: 'node http server',
    kind: 'node' as const,
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
  {
    label: 'infinite loop is killed',
    kind: 'js' as const,
    code: `export const spin = () => { while (true) {} };\nspin();`,
    tests: `it('never runs', () => {});`,
  },
  {
    label: 'syntax error is explained',
    kind: 'js' as const,
    code: `export const oops = (a, b) => { return a + }`,
    tests: `it('never runs', () => {});`,
  },
];

let failures = 0;
for (const c of cases) {
  const r = await runExercise(c);
  const summary = r.error
    ? `error: ${r.error.split('\n')[0]}`
    : r.tests.map((t) => `${t.passed ? '✓' : '✗'} ${t.name}${t.error ? ` — ${t.error.split('\n')[0]}` : ''}`).join(' | ');
  console.log(`\n[${c.label}] ok=${r.ok} ${r.ms}ms${r.timedOut ? ' TIMEOUT' : ''}\n  ${summary}`);
  const expectedOk = c.label.includes('pass') || ['ts transpile + async', 'react hook + event', 'sql query', 'node http server'].includes(c.label);
  if (expectedOk && !r.ok) { failures++; console.log('  !! expected this to pass'); }
}
console.log(failures ? `\n${failures} unexpected failures` : '\nall expectations met');
await sweepRunsDir();
process.exit(failures ? 1 : 0);
