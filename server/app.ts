/**
 * The HTTP surface. `createApp` takes its collaborators as arguments so the
 * whole API can be exercised in-process with a scratch data directory and a
 * stubbed runner — no listening socket needed.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import type { HintResponse, RevealResponse, SubmitResponse } from '../web/src/api.ts';
import type { Lesson } from '../content/types.ts';
import type { Progress } from './progress.ts';
import type { RunRequest, RunResult } from './runner/index.ts';
import { locate, lessonUnlocked, totalLessons, totalXp, tracks } from './content.ts';
import { appState, lessonLinks, profile, publicLesson, xpAtStake } from './projections.ts';
import { applyPass, ensureDay, reconcileAchievements } from './rewards.ts';

export interface Runner {
  run(req: RunRequest): Promise<RunResult>;
}

export interface Store {
  load(): Promise<Progress>;
  save(): Promise<void>;
  reset(): Promise<Progress>;
  record: typeof import('./progress.ts').record;
  log: typeof import('./progress.ts').log;
}

export interface AppOptions {
  store: Store;
  runner: Runner;
  now?: () => Date;
}

const MAX_CODE = 60_000;

/** Everything the grader needs from a lesson, plus the learner's code. */
const runRequest = (l: Lesson, code: string): RunRequest => ({
  kind: l.kind, code, tests: l.tests, fixtures: l.fixtures,
  subject: l.subject, mutants: l.mutants, equivalents: l.equivalents, subjectKind: l.subjectKind,
  minTests: l.minTests, testTimeoutMs: l.testTimeoutMs,
});

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Express 4 does not catch a rejected promise from a handler; this does. */
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

const ALLOWED_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export function createApp({ store, runner, now = () => new Date() }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');

  // Only loopback origins may talk to us: this server can run arbitrary code.
  app.use((req, res, next) => {
    if (!ALLOWED_HOST.test(req.headers.host ?? '')) return res.status(421).json({ error: 'Bad host' });
    next();
  });
  app.use(express.json({ limit: '128kb' }));

  /* ------------------------------------------------------------ helpers */

  const codeFrom = (body: unknown): string => {
    const code = (body as { code?: unknown })?.code;
    if (typeof code !== 'string') throw new HttpError(400, '`code` must be a string');
    if (code.length > MAX_CODE) throw new HttpError(413, `Code is limited to ${MAX_CODE.toLocaleString()} characters`);
    return code;
  };

  const answersFrom = (body: unknown, questions: number): number[][] => {
    const answers = (body as { answers?: unknown })?.answers;
    if (!Array.isArray(answers)) throw new HttpError(400, '`answers` must be an array');
    const clean = answers.slice(0, questions).map((a) => {
      const list = Array.isArray(a) ? a : [a];
      if (!list.every((n) => Number.isInteger(n) && (n as number) >= 0)) {
        throw new HttpError(400, 'each answer must be a list of non-negative option indexes');
      }
      return [...new Set(list as number[])].sort((x, y) => x - y);
    });
    while (clean.length < questions) clean.push([]);
    return clean;
  };

  const requireLesson = (id: string) => {
    const loc = locate(id);
    if (!loc) throw new HttpError(404, 'No such lesson');
    return loc;
  };

  const requireUnlocked = (id: string, p: Progress) => {
    const loc = requireLesson(id);
    if (!lessonUnlocked(id, p)) throw new HttpError(403, 'Lesson is locked');
    return loc;
  };

  /** A lesson can only be graded once at a time, and only one grading runs at all. */
  const inFlight = new Set<string>();
  let queue: Promise<unknown> = Promise.resolve();
  const grade = async (lessonId: string, work: () => Promise<RunResult>) => {
    if (inFlight.has(lessonId)) throw new HttpError(409, 'Already grading this lesson');
    inFlight.add(lessonId);
    const turn = queue.then(work, work);
    queue = turn.catch(() => {});
    try {
      return await turn;
    } finally {
      inFlight.delete(lessonId);
    }
  };

  /**
   * Did the sandbox actually judge the learner's code? A boot timeout, a
   * crashed worker, or a broken grader is our failure, not theirs.
   */
  const isScored = (r: RunResult) =>
    r.tests.length > 0 || r.phase === 'compile' || r.phase === 'load' || (r.timedOut === true && r.ready === true);

  const gradeQuiz = (quiz: { answer: number[]; q: string }[], given: number[][]): RunResult => {
    const tests = quiz.map((question, i) => {
      const want = [...question.answer].sort((a, b) => a - b);
      const picked = given[i] ?? [];
      const passed = picked.length === want.length && picked.every((v, j) => v === want[j]);
      // No explanation on failure: it would name the right answer.
      return { name: question.q.length > 90 ? question.q.slice(0, 90) + '…' : question.q, passed };
    });
    return { ok: tests.length > 0 && tests.every((t) => t.passed), tests, logs: [], ms: 0, ready: true };
  };

  /* ------------------------------------------------------------- routes */

  const api = express.Router();

  api.get('/health', (_req, res) => {
    res.json({ ok: true, lessons: totalLessons, xp: totalXp, tracks: tracks.length });
  });

  api.get('/state', wrap(async (_req, res) => {
    const p = await store.load();
    const at = now();
    const rolled = ensureDay(p, at);
    const paid = reconcileAchievements(p, at).length > 0;
    if (rolled || paid) await store.save();
    res.json(appState(p, at));
  }));

  api.get('/lesson/:id', wrap(async (req, res) => {
    const p = await store.load();
    const loc = requireLesson(req.params.id);
    res.json(publicLesson(loc, p));
  }));

  api.post('/lesson/:id/draft', wrap(async (req, res) => {
    const p = await store.load();
    const loc = requireUnlocked(req.params.id, p);
    const rec = store.record(p, loc.lesson.id, !!loc.lesson.boss);
    rec.draft = codeFrom(req.body);
    rec.lastTouchedAt = now().toISOString();
    await store.save();
    res.json({ ok: true });
  }));

  api.post('/lesson/:id/hint', wrap(async (req, res) => {
    const p = await store.load();
    const loc = requireUnlocked(req.params.id, p);
    const hints = loc.lesson.hints ?? [];
    const rec = store.record(p, loc.lesson.id, !!loc.lesson.boss);
    if (rec.hintsUsed < hints.length) {
      rec.hintsUsed++;
      rec.lastTouchedAt = now().toISOString();
      p.stats.hintsOpened++;
      store.log(p, { kind: 'hint', lessonId: loc.lesson.id, label: `Hint ${rec.hintsUsed} — ${loc.lesson.title}` });
      await store.save();
    }
    const body: HintResponse = {
      hints: hints.slice(0, rec.hintsUsed),
      exhausted: rec.hintsUsed >= hints.length,
      xpAtStake: rec.status === 'passed' ? 0 : xpAtStake(loc, p),
    };
    res.json(body);
  }));

  api.post('/lesson/:id/solution', wrap(async (req, res) => {
    const p = await store.load();
    const loc = requireUnlocked(req.params.id, p);
    if (!loc.lesson.solution) throw new HttpError(404, 'No reference solution for this lesson');
    const rec = store.record(p, loc.lesson.id, !!loc.lesson.boss);
    if (!rec.solutionRevealed) {
      rec.solutionRevealed = true;
      rec.lastTouchedAt = now().toISOString();
      store.log(p, { kind: 'solution', lessonId: loc.lesson.id, label: `Revealed solution — ${loc.lesson.title}` });
      await store.save();
    }
    const body: RevealResponse = {
      solution: loc.lesson.solution,
      xpIfPassed: rec.status === 'passed' ? 0 : xpAtStake(loc, p),
    };
    res.json(body);
  }));

  /** Run without consequences: no attempt counted, no XP. */
  api.post('/lesson/:id/run', wrap(async (req, res) => {
    const p = await store.load();
    const loc = requireUnlocked(req.params.id, p);
    if (loc.lesson.kind === 'quiz') throw new HttpError(400, 'Quizzes are answered, not run');
    const code = codeFrom(req.body);
    const rec = store.record(p, loc.lesson.id, !!loc.lesson.boss);
    rec.draft = code;
    rec.lastTouchedAt = now().toISOString();
    await store.save();

    const result = await grade(loc.lesson.id, () =>
      runner.run(runRequest(loc.lesson, code)));
    p.stats.sandboxMs += result.ms;
    await store.save();

    const body: SubmitResponse = {
      result, rewards: null, scored: isScored(result), alreadyPassed: rec.status === 'passed',
      profile: profile(p, now()), attempts: rec.attempts, xpAtStake: xpAtStake(loc, p), status: rec.status,
      ...lessonLinks(loc, p),
    };
    res.json(body);
  }));

  api.post('/lesson/:id/submit', wrap(async (req, res) => {
    const p = await store.load();
    const loc = requireUnlocked(req.params.id, p);

    let result: RunResult;
    if (loc.lesson.kind === 'quiz') {
      result = gradeQuiz(loc.lesson.quiz ?? [], answersFrom(req.body, loc.lesson.quiz?.length ?? 0));
    } else {
      const code = codeFrom(req.body);
      store.record(p, loc.lesson.id, !!loc.lesson.boss).draft = code;
      await store.save();
      result = await grade(loc.lesson.id, () =>
        runner.run(runRequest(loc.lesson, code)));
      p.stats.sandboxMs += result.ms;
    }

    // Everything below is synchronous: read the record AFTER the await so a
    // parallel submit of the same lesson cannot pay twice.
    const at = now();
    ensureDay(p, at);
    const rec = store.record(p, loc.lesson.id, !!loc.lesson.boss);
    const alreadyPassed = rec.status === 'passed';
    const scored = isScored(result);
    rec.lastTouchedAt = at.toISOString();
    rec.lastRunMs = result.ms;
    if (scored) p.stats.submits++;

    let rewards = null;
    if (scored && !alreadyPassed) {
      rec.attempts++;
      if (result.ok) {
        rewards = applyPass(p, loc.lesson.id, at);
      } else {
        rec.status = 'attempted';
        store.log(p, { kind: 'fail', lessonId: loc.lesson.id, label: `Attempt ${rec.attempts} — ${loc.lesson.title}` }, at.toISOString());
      }
    }
    await store.save();

    const body: SubmitResponse = {
      result, rewards, scored, alreadyPassed,
      profile: profile(p, at), attempts: rec.attempts, xpAtStake: xpAtStake(loc, p), status: rec.status,
      // A pass can unlock the next lesson (or the next chapter), so recompute.
      ...lessonLinks(loc, p),
    };
    res.json(body);
  }));

  api.get('/quiz/:id/explain', wrap(async (req, res) => {
    const p = await store.load();
    const loc = requireLesson(req.params.id);
    if (!loc.lesson.quiz) throw new HttpError(404, 'Not a quiz');
    if (p.lessons[loc.lesson.id]?.status !== 'passed') throw new HttpError(403, 'Pass the quiz first');
    res.json({ answers: loc.lesson.quiz.map((q) => ({ answer: q.answer, explain: q.explain })) });
  }));

  api.get('/export', wrap(async (_req, res) => {
    const p = await store.load();
    res.setHeader('content-disposition', `attachment; filename="bootlocalopus-progress-${p.createdAt.slice(0, 10)}.json"`);
    res.json(p);
  }));

  api.post('/reset', wrap(async (req, res) => {
    if ((req.body as { confirm?: unknown })?.confirm !== 'RESET') {
      throw new HttpError(400, 'Send { confirm: "RESET" } to wipe progress');
    }
    const p = await store.reset();
    res.json({ ok: true, profile: profile(p, now()) });
  }));

  api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);

  /* ------------------------------------------------------------- errors */

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { status?: number; statusCode?: number; type?: string; message?: string };
    if (e.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    if (e.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    const status = e.status ?? e.statusCode ?? 500;
    if (status >= 500) {
      console.error('[api]', err);
      return res.status(status).json({ error: 'Internal error' });
    }
    res.status(status).json({ error: e.message ?? 'Request failed' });
  });

  return app;
}
