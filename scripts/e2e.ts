/**
 * End-to-end check: starts its own server on a scratch data directory, plays
 * through lessons the way a learner would, and asserts the game layer and the
 * API's defensive behaviour. Never touches the real save file.
 *
 * Answers come from the content module (each lesson's reference solution and
 * quiz key), so editing a lesson cannot silently stale this suite. The lesson
 * ids below are deliberate: the unlock-rule checks depend on the shape of the
 * first two JavaScript chapters.
 *
 *   npm run test:api
 */
import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import type { Lesson } from '../content/types.ts';
import { allLessons, findLesson } from './lib/lessons.ts';
import { makeChecker, startServer } from './lib/server-harness.ts';

const lessonOf = (id: string): Lesson => {
  const l = findLesson(id);
  if (!l) throw new Error(`e2e: lesson "${id}" is not in content/ — update scripts/e2e.ts`);
  return l;
};
/** The reference solution, as a learner would type it. */
const ref = (id: string): string => {
  const s = lessonOf(id).solution;
  if (!s) throw new Error(`e2e: lesson "${id}" has no reference solution`);
  return s;
};
const quizKey = (id: string): number[][] => (lessonOf(id).quiz ?? []).map((q) => [...q.answer]);
/** A clean pass pays base × 1.2 (rounded), per the economy in server/gamify.ts. */
const clean = (id: string) => Math.round(lessonOf(id).xp * 1.2);

const server = await startServer();
const BASE = server.base;
const { check, failures } = makeChecker();

const get = async (p: string) => {
  const res = await fetch(BASE + p);
  return { status: res.status, body: await res.json().catch(() => null) };
};
const post = async (p: string, body?: unknown, raw?: string) => {
  const res = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const ok = async (p: string, body?: unknown) => {
  const r = await post(p, body);
  if (r.status !== 200) throw new Error(`POST ${p} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
/** Submit the right answer for any lesson: its reference solution, or its quiz key. */
const passLesson = (id: string) => {
  const l = lessonOf(id);
  return ok(`/api/lesson/${id}/submit`, l.kind === 'quiz' ? { answers: quizKey(id) } : { code: ref(id) });
};

/**
 * Open a lesson the honest way: pass the unlocked, unpassed lessons before it
 * in its track, in order, until it unlocks. Returns false if it never does.
 */
async function playUntilUnlocked(id: string, maxSteps = 40): Promise<boolean> {
  for (let step = 0; step < maxSteps; step++) {
    if ((await get(`/api/lesson/${id}`)).body?.unlocked) return true;
    const state = (await get('/api/state')).body;
    const track = state.tracks.find((t: any) => t.chapters.some((c: any) => c.lessons.some((l: any) => l.id === id)));
    const order: any[] = track.chapters.flatMap((c: any) => c.lessons);
    const target = order.findIndex((l) => l.id === id);
    const next = order.slice(0, target).find((l) => l.unlocked && l.status !== 'passed');
    if (!next) return false;
    const r = await passLesson(next.id);
    if (r.result?.ok !== true) {
      console.log(`      (could not pass ${next.id} on the way: ${r.result?.error ?? 'tests failed'})`);
      return false;
    }
  }
  return false;
}

try {
  /* -------------------------------------------------------- fresh state */
  console.log('\nFresh state');
  const fresh = (await get('/api/state')).body;
  check('starts at level 1, 0 XP, Junior I', fresh.profile.level === 1 && fresh.profile.xp === 0 && fresh.profile.rank === 'Junior I', fresh.profile);
  check('next rank names what it needs', /10%/.test(fresh.profile.nextRank?.needs ?? ''), fresh.profile.nextRank);
  check('readiness is 0%', fresh.profile.readiness === 0);
  check('streak starts at 0 with no freezes', fresh.profile.streak.current === 0 && fresh.profile.streak.freezes === 0, fresh.profile.streak);
  check('quest board has 3 feasible quests', fresh.quests.length === 3, fresh.quests);
  {
    // A "Solve 2 <kind>" quest needs at least two lessons of that kind in the curriculum.
    const KIND_QUESTS: [RegExp, string[]][] = [
      [/Postgres/, ['sql']], [/React/, ['react']], [/TypeScript/, ['typecheck', 'ts']],
      [/Node/, ['node']], [/Write the tests/, ['mutation']],
    ];
    const count = (kinds: string[]) => allLessons().filter((e) => kinds.includes(e.lesson.kind)).length;
    const infeasible = fresh.quests.filter((q: any) => {
      const hit = KIND_QUESTS.find(([re]) => re.test(q.label));
      const goal = Number(/\d+/.exec(q.label)?.[0] ?? 0);
      return hit ? count(hit[1]) < goal : false;
    });
    check('no kind quest asks for more lessons than the curriculum has', infeasible.length === 0, infeasible);
  }
  check('secret badges are redacted on the wire', fresh.achievements.some((a: any) => a.title === 'Secret achievement'));
  check('tracks carry a short label', fresh.tracks.every((t: any) => typeof t.short === 'string' && t.short.length > 0));
  check('first lesson of every track is open', fresh.tracks.every((t: any) => t.chapters[0].lessons[0].unlocked));
  check('nextUp is the first lesson', fresh.nextUp?.id === allLessons()[0].lesson.id, fresh.nextUp);

  /* --------------------------------------------------- defensive surface */
  console.log('\nDefensive surface');
  // fetch() silently drops a custom Host header, so this one goes through node:http.
  const badHost = await new Promise<number>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: server.port, path: '/api/health', headers: { host: 'evil.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
  check('a foreign Host header is refused with 421 (DNS-rebinding guard)', badHost === 421, badHost);
  check('malformed JSON is a 400 JSON error', (await post('/api/lesson/js-closure-state/submit', undefined, '{bad')).status === 400);
  const notString = await post('/api/lesson/js-closure-state/submit', { code: { toString: 1 } });
  check('non-string code is a 400, not a crash', notString.status === 400, notString);
  check('server survived', (await get('/api/health')).status === 200);
  check('oversized code is a 413', (await post('/api/lesson/js-closure-state/run', { code: 'x'.repeat(70_000) })).status === 413);
  check('unknown lesson is a JSON 404', (await get('/api/lesson/nope')).status === 404);
  check('unknown API route is a JSON 404', (await get('/api/nothing-here')).status === 404);
  check('reset without confirmation is refused', (await post('/api/reset', {})).status === 400);
  check('running a quiz is refused before any sandbox call',
    (await post('/api/lesson/craft-code-review/run', { code: 'x' })).status === 400);
  check('bad quiz answers are a 400', (await post('/api/lesson/craft-code-review/submit', { answers: 'nope' })).status === 400);

  console.log('\nLocked lessons are locked everywhere');
  for (const route of ['hint', 'solution', 'run', 'draft', 'submit']) {
    const r = await post(`/api/lesson/js-task-queue/${route}`, { code: 'x' });
    check(`/${route} on a locked lesson is 403`, r.status === 403, r);
  }
  const lockedView = (await get('/api/lesson/js-task-queue')).body;
  check('the locked lesson view explains why', lockedView.unlocked === false && /clear|open/i.test(lockedView.lockReason ?? ''), lockedView.lockReason);
  check('no solution or grader on the wire', lockedView.solution === undefined && !('tests' in lockedView));

  /* --------------------------------------------------------- grading */
  console.log('\nGrading');
  const wrong = await ok('/api/lesson/js-closure-state/submit', { code: 'export const createCounter = () => ({ increment: () => 1, decrement: () => 1, value: () => 0 });' });
  check('wrong answer fails and is scored', wrong.result.ok === false && wrong.scored === true, wrong);
  check('attempt counted', wrong.attempts === 1 && wrong.status === 'attempted');
  check('xpAtStake reported', typeof wrong.xpAtStake === 'number' && wrong.xpAtStake > 0, wrong.xpAtStake);

  const broken = await ok('/api/lesson/js-closure-state/submit', { code: 'export function oops( {' });
  check('a syntax error is a scored compile failure', broken.scored === true && broken.result.phase === 'compile', broken.result);

  const exited = await ok('/api/lesson/js-closure-state/submit', { code: 'process.exit(0)' });
  check('process.exit is answered immediately, not at the timeout', exited.result.phase === 'exit' && exited.result.ms < 8_000, exited.result);

  const faked = await ok('/api/lesson/js-closure-state/submit', {
    code: `globalThis.expect = () => new Proxy({}, { get: () => () => {} });\nexport const createCounter = () => ({});`,
  });
  check('overwriting expect() does not fake a pass', faked.result.ok === false, faked.result);

  const spoofed = await ok('/api/lesson/js-closure-state/submit', {
    code: `import { parentPort } from 'node:worker_threads';\nparentPort.postMessage({ ok: true, tests: [{ name: 'x', passed: true }], logs: [] });\nexport const createCounter = () => ({});`,
  });
  check('posting a fake result does not fake a pass', spoofed.result.ok === false, spoofed.result);

  const right = await ok('/api/lesson/js-closure-state/submit', { code: ref('js-closure-state') });
  check('the right answer passes', right.result.ok === true, right.result.tests.filter((t: any) => !t.passed));
  const base1 = lessonOf('js-closure-state').xp;
  check(`paid base × 1.2 for a clean pass (${base1} → ${clean('js-closure-state')})`,
    right.rewards?.xp?.total === clean('js-closure-state') && right.rewards.xp.cleanBonus === clean('js-closure-state') - base1, right.rewards?.xp);
  check('First Blood awarded (10 XP)', right.rewards?.newAchievements.some((a: any) => a.id === 'first-blood' && a.xp === 10), right.rewards?.newAchievements);
  check('streak started', right.rewards?.streak.current === 1);
  const again = await ok('/api/lesson/js-closure-state/submit', { code: ref('js-closure-state') });
  check('re-submitting a cleared lesson pays nothing and stays passed', again.rewards === null && again.alreadyPassed && again.status === 'passed');

  console.log('\nParallel submits cannot double-pay');
  const [a, b] = await Promise.all([
    post('/api/lesson/js-once-memoize/submit', { code: ref('js-once-memoize') }),
    post('/api/lesson/js-once-memoize/submit', { code: ref('js-once-memoize') }),
  ]);
  const statuses = [a.status, b.status].sort();
  check('one wins, one is a 409', statuses.join(',') === '200,409', statuses);
  const paidOnce = [a, b].filter((r) => r.body?.rewards).length;
  check('exactly one payout', paidOnce === 1, { a: a.body?.rewards?.xp, b: b.body?.rewards?.xp });
  const afterPair = (await get('/api/state')).body;
  const pairTotal = clean('js-closure-state') + clean('js-once-memoize');
  check(`lesson XP total is ${clean('js-closure-state')} + ${clean('js-once-memoize')}`, afterPair.profile.xpFromLessons === pairTotal, afterPair.profile.xpFromLessons);

  /* ------------------------------------------------------------ hints */
  console.log('\nHints and reveals');
  const before = (await get('/api/lesson/js-this-binding')).body;
  check('hint cost is base × 0.5 / hintCount', before.hintCost === Math.round((lessonOf('js-this-binding').xp * 0.5) / before.hintCount), { cost: before.hintCost, count: before.hintCount });
  const h1 = await ok('/api/lesson/js-this-binding/hint');
  check('a hint lowers the stake and forfeits the clean bonus', h1.xpAtStake < lessonOf('js-this-binding').xp && h1.xpAtStake === lessonOf('js-this-binding').xp - before.hintCost, { stake: h1.xpAtStake, cost: before.hintCost });
  const reveal = await ok('/api/lesson/js-this-binding/solution');
  check('reveal quotes 20%', reveal.xpIfPassed === Math.round(lessonOf('js-this-binding').xp * 0.2), reveal.xpIfPassed);
  const revealedView = (await get('/api/lesson/js-this-binding')).body;
  check('the revealed solution survives a reload', revealedView.solutionRevealed === true && typeof revealedView.solution === 'string');
  const cheap = await ok('/api/lesson/js-this-binding/submit', { code: reveal.solution });
  check('a pass after reveal pays 20%', cheap.rewards?.xp?.total === Math.round(lessonOf('js-this-binding').xp * 0.2) && cheap.rewards.xp.hintPenalty === 0, cheap.rewards?.xp);
  const laterHint = await ok('/api/lesson/js-this-binding/hint');
  check('hints after passing cost nothing', laterHint.xpAtStake === 0);
  const rec = JSON.parse(await readFile(path.join(server.dataDir, 'progress.json'), 'utf8')).lessons['js-this-binding'];
  check('the pass snapshot is frozen (hintsUsed at pass time = 1)', rec.pass?.hintsUsed === 1 && rec.hintsUsed === 2, rec);

  /* --------------------------------------------------------- unlocking */
  console.log('\nThe "all but one" rule');
  check('with 3 of 5 cleared in chapter 1, lesson 4 is open (one may be skipped)',
    (await get('/api/lesson/js-compose-pipe')).body.unlocked === true);
  check('the boss is open too: only one lesson before it is unpassed',
    (await get('/api/lesson/js-event-emitter')).body.unlocked === true);
  check('chapter 2 opens only when at most one of chapter 1 is unpassed',
    (await get('/api/lesson/js-promise-parallel')).body.unlocked === false);
  await ok('/api/lesson/js-compose-pipe/submit', { code: ref('js-compose-pipe') });
  const c2 = (await get('/api/lesson/js-promise-parallel')).body;
  check('…and now it does, with the boss still skippable', c2.unlocked === true, c2.lockReason);
  check('two unpassed lessons before one DO lock it',
    (await get('/api/lesson/js-map-limit')).body.unlocked === false);

  /* -------------------------------------------------------------- quiz */
  console.log('\nQuiz');
  await ok('/api/lesson/js-promise-parallel/submit', { code: ref('js-promise-parallel') });
  const eventLoop = quizKey('js-event-loop');
  // Wrong: pick a non-answer for every question (a multi-select loses its last correct option).
  const wrongAnswers = lessonOf('js-event-loop').quiz!.map((q) =>
    q.answer.length > 1 ? q.answer.slice(0, -1) : [q.options.findIndex((_, i) => !q.answer.includes(i))]);
  const wrongQuiz = await ok('/api/lesson/js-event-loop/submit', { answers: wrongAnswers });
  check('wrong answers fail without leaking explanations',
    wrongQuiz.result.ok === false && wrongQuiz.result.tests.every((t: any) => t.error === undefined), wrongQuiz.result.tests[0]);
  check('explanations are withheld before passing', (await get('/api/quiz/js-event-loop/explain')).status === 403);
  const rightQuiz = await ok('/api/lesson/js-event-loop/submit', { answers: eventLoop });
  check('right answers pass', rightQuiz.result.ok === true, rightQuiz.result.tests.filter((t: any) => !t.passed));
  check('explanations unlock after passing', (await get('/api/quiz/js-event-loop/explain')).body.answers.length === eventLoop.length);
  const messy = eventLoop.map((a, i) => (i === 0 ? [...a, a[0]] : i === eventLoop.length - 1 ? [...a, 99] : [...a].reverse()));
  check('duplicate/out-of-range answer indexes are tolerated', (await post('/api/lesson/js-event-loop/submit', { answers: messy })).status === 200);

  /* --------------------------------------------------------- every kind */
  console.log('\nEvery lesson kind grades through the API');
  // The first four are the first lessons of their tracks (open on a fresh save).
  // Kinds that are newer than this suite use the earliest lesson of that kind,
  // played open honestly, and are skipped with a note when none exists yet.
  const KINDS: [string, string | undefined][] = [
    ['typecheck', 'ts-narrowing'],
    ['react', 'react-controlled-form'],
    ['node', 'node-http-router'],
    ['sql', 'sql-constraints'],
    ['node-db', undefined],
    ['mutation', undefined],
  ];
  for (const [kind, preferred] of KINDS) {
    const candidates = allLessons().filter((e) => e.lesson.kind === kind);
    const trackPos = (e: (typeof candidates)[number]) =>
      e.track.chapters.flatMap((c) => c.lessons).findIndex((l) => l.id === e.lesson.id);
    const pick = preferred ?? candidates.sort((a, b) => trackPos(a) - trackPos(b))[0]?.lesson.id;
    if (!pick) {
      console.log(`  - ${kind}: skipped, no lesson of this kind exists yet`);
      continue;
    }
    if (!(await playUntilUnlocked(pick))) {
      check(`${kind} (${pick}) could be unlocked by playing the track`, false);
      continue;
    }
    const r = await ok(`/api/lesson/${pick}/submit`, { code: ref(pick) });
    check(`${kind} (${pick}) passes and pays`, r.result.ok === true && (r.rewards?.xp?.total ?? 0) > 0,
      r.result.error ?? r.result.tests?.filter((t: any) => !t.passed));
  }

  /* ----------------------------------------------------------- persistence */
  console.log('\nPersistence');
  const saved = JSON.parse(await readFile(path.join(server.dataDir, 'progress.json'), 'utf8'));
  check('save file is version 2 with split XP', saved.version === 2 && saved.xpFromLessons > 0 && saved.xpFromMeta > 0, { v: saved.version, l: saved.xpFromLessons, m: saved.xpFromMeta });
  check('a lock file names this process', JSON.parse(await readFile(path.join(server.dataDir, '.lock'), 'utf8')).pid > 0);
  const exported = await fetch(BASE + '/api/export');
  check('export downloads the save', exported.status === 200 && /attachment/.test(exported.headers.get('content-disposition') ?? ''));

  const final = (await get('/api/state')).body;
  console.log(`\nFinal: ${final.profile.rank}, level ${final.profile.level}, ${final.profile.xp} XP ` +
    `(${final.profile.xpFromLessons} lessons + ${final.profile.xpFromMeta} bonus), ` +
    `${final.profile.lessonsPassed} lessons, readiness ${final.profile.readiness}%`);
} finally {
  await server.stop();
}

console.log(failures() ? `\n${failures()} CHECK(S) FAILED\n` : '\nAll end-to-end checks passed.\n');
process.exit(failures() ? 1 : 0);
