/**
 * End-to-end check against a running API: play through several lessons the way
 * a learner would, and assert that the game layer responds correctly.
 *
 *   npx tsx scripts/e2e.ts        (server must already be running)
 *
 * This resets progress, so run it against a throwaway save file.
 */
export {};   // makes this a module, so top-level await is allowed

const BASE = process.env.BASE ?? 'http://127.0.0.1:4517';

const get = async (path: string) => {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
};
const post = async (path: string, body?: unknown) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

let failures = 0;
const check = (label: string, condition: boolean, detail?: unknown) => {
  console.log(`${condition ? '  ✓' : '  ✗'} ${label}`);
  if (!condition) {
    failures++;
    if (detail !== undefined) console.log('      got:', JSON.stringify(detail)?.slice(0, 400));
  }
};

console.log('\nResetting progress for a clean run…');
await post('/api/reset', { confirm: 'RESET' });

/* ---------------------------------------------------------- initial state */

console.log('\nInitial state');
const fresh = await get('/api/state');
check('starts at level 1 with 0 XP', fresh.profile.level === 1 && fresh.profile.xp === 0, fresh.profile);
check('rank is Junior I', fresh.profile.rank === 'Junior I', fresh.profile.rank);
check('readiness is 0%', fresh.profile.readiness === 0);
check('72 lessons across 6 tracks', fresh.profile.lessonsTotal === 72 && fresh.tracks.length === 6, {
  lessons: fresh.profile.lessonsTotal,
  tracks: fresh.tracks.length,
});
check('three daily quests', fresh.quests.length === 3, fresh.quests.length);
check('nextUp points at the first lesson', fresh.nextUp?.id === 'js-closure-state', fresh.nextUp);

const firstChapter = fresh.tracks[0].chapters[0];
check('first lesson is unlocked', firstChapter.lessons[0].unlocked === true);
check('second lesson is locked', firstChapter.lessons[1].unlocked === false);
check('second chapter is locked', fresh.tracks[0].chapters[1].unlocked === false);
check('the first lesson of every track is open',
  fresh.tracks.every((t: any) => t.chapters[0].lessons[0].unlocked === true));

/* --------------------------------------------------- failing then passing */

console.log('\nSubmitting a wrong answer to js-closure-state');
const wrong = await post('/api/lesson/js-closure-state/submit', {
  code: 'export function createCounter(start = 0) { return { increment: () => 1, decrement: () => 1, value: () => 0 }; }',
});
check('graded as failing', wrong.result.ok === false);
check('reports individual tests', wrong.result.tests.length >= 4, wrong.result.tests.length);
check('no rewards for a failure', wrong.rewards === null);
check('attempt was counted', wrong.attempts === 1, wrong.attempts);
check(
  'failure messages are human-readable',
  /expected/.test(wrong.result.tests.find((t: any) => !t.passed)?.error ?? ''),
  wrong.result.tests.find((t: any) => !t.passed)?.error,
);

console.log('\nSubmitting a syntax error');
const broken = await post('/api/lesson/js-closure-state/submit', { code: 'export function oops( {' });
check('compile failure is explained, not crashed', broken.result.ok === false && !!broken.result.error, broken.result.error);
check('phase is compile', broken.result.phase === 'compile', broken.result.phase);

console.log('\nSubmitting an infinite loop');
const spin = await post('/api/lesson/js-closure-state/submit', {
  code: 'export function createCounter() { while (true) {} }\ncreateCounter();',
});
check('timeout is caught and named', spin.result.timedOut === true, spin.result);
check('timeout explains what was running', /Timed out/.test(spin.result.error ?? ''), spin.result.error);

console.log('\nSubmitting the correct answer (4th attempt, so no first-try bonus)');
const right = await post('/api/lesson/js-closure-state/submit', {
  code: `export function createCounter(start = 0) {
  let count = start;
  return { increment: () => ++count, decrement: () => --count, value: () => count };
}`,
});
check('graded as passing', right.result.ok === true, right.result.tests.filter((t: any) => !t.passed));
check('XP awarded at base rate', right.rewards?.xp?.total === 50, right.rewards?.xp);
check('no first-try bonus after a failure', right.rewards?.xp?.firstTryBonus === 0, right.rewards?.xp);
check('combo stays at 0 after failures', right.rewards?.combo === 0, right.rewards?.combo);
check('streak started', right.rewards?.streak.current === 1, right.rewards?.streak);
check('First Blood awarded', right.rewards?.newAchievements.some((a: any) => a.id === 'first-blood'), right.rewards?.newAchievements);

const afterFirst = await get('/api/state');
check('XP includes the achievement bonus', afterFirst.profile.xp === 50 + 25, afterFirst.profile.xp);
check('next lesson is now unlocked', afterFirst.tracks[0].chapters[0].lessons[1].unlocked === true);
check('readiness moved off zero', afterFirst.profile.readiness > 0, afterFirst.profile.readiness);
check('history records the pass', afterFirst.history.some((h: any) => h.kind === 'pass'), afterFirst.history[0]);
check('re-submitting a cleared lesson awards nothing twice',
  (await post('/api/lesson/js-closure-state/submit', {
    code: 'export function createCounter(s=0){let c=s;return{increment:()=>++c,decrement:()=>--c,value:()=>c}}',
  })).rewards === null);

/* ------------------------------------------------------------ hints cost XP */

console.log('\nHints reduce the reward');
await post('/api/lesson/js-once-memoize/hint');
await post('/api/lesson/js-once-memoize/hint');
const hinted = await post('/api/lesson/js-once-memoize/submit', {
  code: `export function once(fn) {
  let called = false, result;
  return function (...args) { if (!called) { called = true; result = fn.apply(this, args); } return result; };
}
export function memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
  const cache = new Map();
  const wrapped = function (...args) {
    const key = keyFn.apply(this, args);
    if (!cache.has(key)) cache.set(key, fn.apply(this, args));
    return cache.get(key);
  };
  wrapped.cache = cache;
  return wrapped;
}`,
});
check('passes with hints used', hinted.result.ok === true, hinted.result.tests?.filter((t: any) => !t.passed));
check('two hints cost 24% of base', hinted.rewards?.xp?.hintPenalty === Math.round(60 * 0.24), hinted.rewards?.xp);
check('first-try bonus still applies (hints are not failures)', (hinted.rewards?.xp?.firstTryBonus ?? 0) > 0, hinted.rewards?.xp);
check('combo advanced to 1', hinted.rewards?.combo === 1, hinted.rewards?.combo);

/* -------------------------------------------------- solution reveal caps XP */

console.log('\nRevealing a solution caps the reward');
const revealed = await post('/api/lesson/js-this-binding/solution');
check('solution returned', typeof revealed.solution === 'string' && revealed.solution.length > 50);
check('quoted at 20% of base', revealed.xpIfPassed === Math.round(55 * 0.2), revealed.xpIfPassed);
const afterReveal = await post('/api/lesson/js-this-binding/submit', { code: revealed.solution });
check('the reference solution passes', afterReveal.result.ok === true, afterReveal.result.tests?.filter((t: any) => !t.passed));
check('awarded only 20%', afterReveal.rewards?.xp?.total === Math.round(55 * 0.2), afterReveal.rewards?.xp);
check('combo reset by the reveal', afterReveal.rewards?.combo === 0, afterReveal.rewards?.combo);

/* --------------------------------------------------- run is consequence-free */

console.log('\nRun does not count as an attempt');
const before = await get('/api/lesson/js-compose-pipe');
await post('/api/lesson/js-compose-pipe/run', { code: 'export function pipe() { return 1; }' });
const after = await get('/api/lesson/js-compose-pipe');
check('attempts unchanged by run', after.attempts === before.attempts, { before: before.attempts, after: after.attempts });
check('draft was saved by run', after.starter.includes('return 1;'), after.starter.slice(0, 80));

console.log('\nClearing the chapter to 80% unlocks the next one');
await post('/api/lesson/js-compose-pipe/submit', {
  code: `export function pipe(...fns) {
  return (...args) => {
    if (fns.length === 0) return args[0];
    return fns.slice(1).reduce((acc, fn) => fn(acc), fns[0](...args));
  };
}
export function compose(...fns) { return pipe(...[...fns].reverse()); }
export function pipeAsync(...fns) {
  return async (...args) => {
    if (fns.length === 0) return args[0];
    let value = await fns[0](...args);
    for (const fn of fns.slice(1)) value = await fn(value);
    return value;
  };
}`,
});
const unlocked = await get('/api/state');
check('4 of 5 lessons cleared in chapter 1', unlocked.tracks[0].chapters[0].passed === 4, unlocked.tracks[0].chapters[0].passed);
check('chapter 2 is now unlocked', unlocked.tracks[0].chapters[1].unlocked === true);

/* ------------------------------------------------------------------- quiz */

console.log('\nWithin a chapter, lessons still unlock one at a time');
const midChapter = await get('/api/lesson/js-event-loop');
check('the second lesson of an unlocked chapter is still gated', midChapter.unlocked === false);
await post('/api/lesson/js-promise-parallel/submit', {
  code: `export async function loadSequential(ids, loadOne) {
  const out = [];
  for (const id of ids) out.push(await loadOne(id));
  return out;
}
export async function loadParallel(ids, loadOne) {
  return Promise.all(ids.map((id) => loadOne(id)));
}
export async function settleAll(ids, loadOne) {
  return Promise.all(ids.map((id) =>
    Promise.resolve()
      .then(() => loadOne(id))
      .then((value) => ({ status: 'fulfilled', value }))
      .catch((reason) => ({ status: 'rejected', reason }))));
}`,
});
check('it opens once the previous lesson is cleared',
  (await get('/api/lesson/js-event-loop')).unlocked === true);

console.log('\nQuiz grading');
const wrongQuiz = await post('/api/lesson/js-event-loop/submit', { answers: [[1], [0], [0], [0], [0]] });
check('wrong quiz answers fail', wrongQuiz.result.ok === false);
check('explanations come back as the failure reason',
  wrongQuiz.result.tests.some((t: any) => !t.passed && (t.error ?? '').length > 20));
const blocked = await fetch(BASE + '/api/quiz/js-event-loop/explain');
check('explanations are withheld until it is passed', blocked.status === 403, blocked.status);

const rightQuiz = await post('/api/lesson/js-event-loop/submit', { answers: [[0], [1], [0, 1, 2], [2], [1]] });
check('correct quiz answers pass', rightQuiz.result.ok === true, rightQuiz.result.tests.filter((t: any) => !t.passed));
check('quiz awards XP', (rightQuiz.rewards?.xp?.total ?? 0) > 0, rightQuiz.rewards?.xp);
const explain = await get('/api/quiz/js-event-loop/explain');
check('explanations unlock after passing', explain.answers.length === 5, explain.answers.length);

/* -------------------------------------------------- every kind runs for real */

console.log('\nEach lesson kind grades through the API');
const kinds: [string, string, string][] = [
  ['typecheck (real tsc)', 'ts-narrowing', `export function isString(value: unknown): value is string {
  return typeof value === 'string';
}
export function isNonNull<T>(value: T | null | undefined): value is T {
  return value != null;
}
export function hasKey<K extends string>(value: unknown, key: K): value is Record<K, unknown> {
  return typeof value === 'object' && value !== null && key in value;
}
export function describe(value: unknown): string {
  if (value === null || value === undefined) return 'nothing';
  if (typeof value === 'string') return 'string: ' + value;
  if (typeof value === 'number') return 'number: ' + value;
  if (Array.isArray(value)) return 'array of ' + value.length;
  if (typeof value === 'object') return 'object';
  return typeof value;
}`],
  ['react (jsdom + RTL)', 'react-controlled-form', `import { useState } from 'react';
const EMPTY = { email: '', password: '' };
export function SignupForm({ onSubmit }) {
  const [values, setValues] = useState(EMPTY);
  const valid = values.email.includes('@') && values.password.length >= 8;
  const change = (e) => setValues((c) => ({ ...c, [e.target.name]: e.target.value }));
  const submit = (e) => { e.preventDefault(); if (!valid) return; onSubmit({ ...values }); setValues(EMPTY); };
  return (
    <form onSubmit={submit}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" value={values.email} onChange={change} />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" value={values.password} onChange={change} />
      <button type="submit" disabled={!valid}>Sign up</button>
    </form>
  );
}`],
  ['node (real http server)', 'node-http-router', `import http from 'node:http';
const USERS = [{ id: '1', name: 'ada' }, { id: '2', name: 'bob' }];
const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const notAllowed = (res) => {
  res.writeHead(405, { allow: 'GET', 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'method not allowed' }));
};
export function createServer() {
  return http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/health') return req.method === 'GET' ? send(res, 200, { status: 'ok' }) : notAllowed(res);
    if (pathname === '/users') return req.method === 'GET' ? send(res, 200, USERS) : notAllowed(res);
    const match = pathname.match(/^\\/users\\/([^/]+)$/);
    if (match) {
      if (req.method !== 'GET') return notAllowed(res);
      const user = USERS.find((u) => u.id === match[1]);
      return user ? send(res, 200, user) : send(res, 404, { error: 'not found' });
    }
    return send(res, 404, { error: 'not found' });
  });
}`],
  ['sql (real Postgres)', 'sql-constraints', `create table authors (
  id serial primary key,
  email text not null unique,
  name text not null,
  joined_at date not null default current_date
);
create table books (
  id serial primary key,
  author_id int not null references authors(id) on delete cascade,
  title text not null,
  price_cents int not null check (price_cents > 0),
  published_year int not null check (published_year between 1450 and 2100)
);`],
];

for (const [label, id, code] of kinds) {
  const out = await post(`/api/lesson/${id}/submit`, { code });
  check(`${label} passes`, out.result.ok === true, out.result.error ?? out.result.tests?.filter((t: any) => !t.passed));
  check(`${label} awards XP`, (out.rewards?.xp?.total ?? 0) > 0, out.rewards?.xp);
}

/* ------------------------------------------------------------ locked lesson */

console.log('\nLocked lessons are refused');
const lockedRes = await fetch(BASE + '/api/lesson/js-task-queue/submit', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: 'export class TaskQueue {}' }),
});
check('submitting a locked lesson is a 403', lockedRes.status === 403, lockedRes.status);
check('an unknown lesson is a 404', (await fetch(BASE + '/api/lesson/nope-not-real')).status === 404);
check('reset without confirmation is refused',
  (await fetch(BASE + '/api/reset', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  })).status === 400);

/* -------------------------------------------------------- solutions are safe */

console.log('\nThe client is never handed answers it has not earned');
const untouched = await get('/api/lesson/js-task-queue');
check('no reference solution in the payload', untouched.solution === undefined);
check('no graders in the payload', !('tests' in untouched));
check('unrevealed hints are not sent', untouched.hints.length === 0 && untouched.hintCount > 0, {
  sent: untouched.hints.length, total: untouched.hintCount,
});
const quizPayload = await get('/api/lesson/craft-code-review');
check('quiz answers are not sent with the questions',
  quizPayload.quiz.every((q: any) => !('answer' in q)), quizPayload.quiz?.[0]);

/* ---------------------------------------------------------------- wrap up */

const final = await get('/api/state');
console.log(
  `\nFinal: level ${final.profile.level} (${final.profile.rank}), ${final.profile.xp} XP, ` +
  `${final.profile.lessonsPassed} lessons, ${final.profile.achievementsEarned} achievements, ` +
  `readiness ${final.profile.readiness}%`,
);

console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : '\nAll end-to-end checks passed.\n');
process.exit(failures ? 1 : 0);
