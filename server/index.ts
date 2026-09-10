import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import * as store from './progress.ts';
import { runExercise, sweepRunsDir } from './runner/index.ts';
import {
  tracks, locate, publicLesson, lessonUnlocked, chapterUnlocked, chapterStats,
  chapterMap, nextUp, totalLessons, totalXp, trackOf, kindOf,
} from './content.ts';
import {
  ACHIEVEMENTS, computeXp, levelFromXp, rankFor, readiness, bumpStreak,
  dayKey, rollDailyQuests, comboMultiplier, type Quest,
} from './gamify.ts';
import type { Progress } from './progress.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PROD = process.argv.includes('--prod');
const PORT = Number(process.env.PORT ?? 4517);

const app = express();
app.use(express.json({ limit: '1mb' }));

/* ------------------------------------------------------------- projections */

function profile(p: Progress) {
  const lv = levelFromXp(p.xp);
  const rank = rankFor(lv.level);
  const ready = readiness(tracks, p);
  const passedCount = Object.values(p.lessons).filter((r) => r.status === 'passed').length;
  return {
    xp: p.xp,
    level: lv.level,
    levelInto: lv.into,
    levelNeed: lv.need,
    levelPct: lv.pct,
    rank: rank.title,
    rankNote: rank.note,
    nextRank: nextRankFor(lv.level),
    combo: p.combo,
    comboMultiplier: comboMultiplier(p.combo),
    streak: p.streak,
    readiness: ready.overall,
    trackReadiness: ready.per,
    lessonsPassed: passedCount,
    lessonsTotal: totalLessons,
    xpAvailable: totalXp,
    achievementsEarned: Object.keys(p.achievements).length,
    achievementsTotal: ACHIEVEMENTS.length,
    stats: p.stats,
    createdAt: p.createdAt,
  };
}

function nextRankFor(level: number) {
  const ranks = [1, 3, 5, 8, 11, 14, 18, 22];
  const next = ranks.find((r) => r > level);
  return next ? { title: rankFor(next).title, atLevel: next } : null;
}

function questBoard(p: Progress) {
  if (p.daily.day !== dayKey()) p.daily = { day: dayKey(), quests: rollDailyQuests() };
  syncQuests(p);
  return p.daily.quests;
}

/** Recompute quest progress from today's counters; returns newly finished ones. */
function syncQuests(p: Progress): Quest[] {
  const day = store.today(p);
  const finished: Quest[] = [];
  for (const q of p.daily.quests) {
    const value =
      q.metric === 'lessons' ? day.lessons
      : q.metric === 'xp' ? day.xp
      : q.metric === 'firstTry' ? day.firstTry
      : q.metric === 'noHints' ? day.noHints
      : q.metric === 'boss' ? day.bosses
      : day.kinds[q.kind ?? ''] ?? 0;
    q.progress = Math.min(value, q.goal);
    if (!q.done && value >= q.goal) {
      q.done = true;
      finished.push(q);
    }
  }
  return finished;
}

function achievementBoard(p: Progress) {
  const ctx = buildCtx(p);
  return ACHIEVEMENTS.map((a) => ({
    id: a.id,
    title: a.title,
    detail: a.detail,
    icon: a.icon,
    xp: a.xp,
    secret: !!a.secret,
    earnedAt: p.achievements[a.id] ?? null,
    /** Recomputed rather than trusted, so editing content can't strand a badge. */
    eligible: a.earned(ctx),
  }));
}

function buildCtx(p: Progress) {
  return {
    p,
    tracks,
    passed: Object.values(p.lessons).filter((r) => r.status === 'passed'),
    totalLessons,
    trackOf,
    kindOf: kindOf as Map<string, string>,
    chapters: chapterMap(p),
  };
}

function trackTree(p: Progress) {
  return tracks.map((track) => {
    const chapters = track.chapters.map((chapter, ci) => {
      const stats = chapterStats(chapter, p);
      return {
        id: chapter.id,
        title: chapter.title,
        summary: chapter.summary,
        unlocked: chapterUnlocked(track, ci, p),
        passed: stats.passed,
        total: stats.total,
        lessons: chapter.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          kind: l.kind,
          xp: l.xp,
          boss: !!l.boss,
          why: l.why,
          status: p.lessons[l.id]?.status ?? 'new',
          firstTry: !!p.lessons[l.id]?.firstTry,
          hintsUsed: p.lessons[l.id]?.hintsUsed ?? 0,
          xpAwarded: p.lessons[l.id]?.xpAwarded ?? 0,
          unlocked: lessonUnlocked(l.id, p),
        })),
      };
    });
    const ids = track.chapters.flatMap((c) => c.lessons.map((l) => l.id));
    return {
      id: track.id,
      title: track.title,
      icon: track.icon,
      color: track.color,
      blurb: track.blurb,
      total: ids.length,
      passed: ids.filter((id) => p.lessons[id]?.status === 'passed').length,
      chapters,
    };
  });
}

/* -------------------------------------------------------- reward pipeline */

interface Rewards {
  xp: ReturnType<typeof computeXp> | null;
  questXp: number;
  achievementXp: number;
  leveledUp: { from: number; to: number; rank: string } | null;
  newAchievements: { id: string; title: string; detail: string; icon: string; xp: number }[];
  questsFinished: { id: string; label: string; xp: number }[];
  streak: { current: number; usedFreeze: boolean; longest: number };
  combo: number;
}

/** Everything that happens the moment a lesson goes green. */
function applyPass(p: Progress, lessonId: string): Rewards {
  const loc = locate(lessonId)!;
  const rec = store.record(p, lessonId, !!loc.lesson.boss);
  const levelBefore = levelFromXp(p.xp).level;

  const breakdown = computeXp({
    base: loc.lesson.xp,
    attempts: rec.attempts,
    hintsUsed: rec.hintsUsed,
    solutionRevealed: rec.solutionRevealed,
    combo: p.combo,
  });

  rec.status = 'passed';
  rec.firstTry = rec.attempts <= 1 && !rec.solutionRevealed;
  rec.solvedAt = new Date().toISOString();
  rec.xpAwarded = breakdown.total;
  rec.boss = !!loc.lesson.boss;
  p.xp += breakdown.total;
  p.combo = breakdown.combo;
  p.stats.passes++;

  const day = store.today(p);
  day.lessons++;
  day.xp += breakdown.total;
  if (rec.firstTry) day.firstTry++;
  if (rec.hintsUsed === 0 && !rec.solutionRevealed) day.noHints++;
  if (loc.lesson.boss) day.bosses++;
  day.kinds[loc.lesson.kind] = (day.kinds[loc.lesson.kind] ?? 0) + 1;

  const streak = bumpStreak(p);
  store.log(p, { kind: 'pass', lessonId, label: loc.lesson.title, xp: breakdown.total });

  // Quests can complete off this pass, and their XP can itself trigger a level.
  const questsFinished = syncQuests(p);
  let questXp = 0;
  for (const q of questsFinished) {
    questXp += q.xp;
    p.xp += q.xp;
    store.log(p, { kind: 'quest', label: q.label, xp: q.xp });
  }

  // Achievements are evaluated last so quest XP counts toward XP-based ones.
  const newAchievements: Rewards['newAchievements'] = [];
  let achievementXp = 0;
  const ctx = buildCtx(p);
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    if (!a.earned(ctx)) continue;
    p.achievements[a.id] = new Date().toISOString();
    p.xp += a.xp;
    achievementXp += a.xp;
    newAchievements.push({ id: a.id, title: a.title, detail: a.detail, icon: a.icon, xp: a.xp });
    store.log(p, { kind: 'achievement', label: a.title, xp: a.xp });
  }

  const levelAfter = levelFromXp(p.xp).level;
  if (levelAfter > levelBefore) {
    store.log(p, { kind: 'levelup', label: `Level ${levelAfter} — ${rankFor(levelAfter).title}` });
  }

  return {
    xp: breakdown,
    questXp,
    achievementXp,
    leveledUp: levelAfter > levelBefore
      ? { from: levelBefore, to: levelAfter, rank: rankFor(levelAfter).title }
      : null,
    newAchievements,
    questsFinished: questsFinished.map((q) => ({ id: q.id, label: q.label, xp: q.xp })),
    streak: { current: p.streak.current, usedFreeze: streak.usedFreeze, longest: p.streak.longest },
    combo: p.combo,
  };
}

/* ------------------------------------------------------------------ routes */

const api = express.Router();

api.get('/state', async (_req, res) => {
  const p = await store.load();
  const next = nextUp(p);
  res.json({
    profile: profile(p),
    tracks: trackTree(p),
    quests: questBoard(p),
    achievements: achievementBoard(p),
    history: p.history.slice(0, 40),
    days: p.days,
    nextUp: next ? { id: next.lesson.id, title: next.lesson.title, track: next.track.title } : null,
  });
  await store.save();
});

api.get('/lesson/:id', async (req, res) => {
  const p = await store.load();
  const loc = locate(req.params.id);
  if (!loc) return res.status(404).json({ error: 'No such lesson' });
  res.json(publicLesson(loc, p));
});

api.post('/lesson/:id/draft', async (req, res) => {
  const p = await store.load();
  const loc = locate(req.params.id);
  if (!loc) return res.status(404).json({ error: 'No such lesson' });
  store.record(p, loc.lesson.id, !!loc.lesson.boss).draft = String(req.body?.code ?? '').slice(0, 60_000);
  res.json({ ok: true });
  await store.save();
});

api.post('/lesson/:id/hint', async (req, res) => {
  const p = await store.load();
  const loc = locate(req.params.id);
  if (!loc) return res.status(404).json({ error: 'No such lesson' });
  const hints = loc.lesson.hints ?? [];
  const rec = store.record(p, loc.lesson.id, !!loc.lesson.boss);
  if (rec.hintsUsed >= hints.length) return res.json({ hints: hints, exhausted: true });
  rec.hintsUsed++;
  p.stats.hintsOpened++;
  store.log(p, { kind: 'hint', lessonId: loc.lesson.id, label: `Hint ${rec.hintsUsed} — ${loc.lesson.title}` });
  res.json({
    hints: hints.slice(0, rec.hintsUsed),
    exhausted: rec.hintsUsed >= hints.length,
    xpAtStake: computeXp({
      base: loc.lesson.xp, attempts: rec.attempts + 1,
      hintsUsed: rec.hintsUsed, solutionRevealed: false, combo: p.combo,
    }).total,
  });
  await store.save();
});

api.post('/lesson/:id/solution', async (req, res) => {
  const p = await store.load();
  const loc = locate(req.params.id);
  if (!loc?.lesson.solution) return res.status(404).json({ error: 'No reference solution for this lesson' });
  const rec = store.record(p, loc.lesson.id, !!loc.lesson.boss);
  rec.solutionRevealed = true;
  store.log(p, { kind: 'solution', lessonId: loc.lesson.id, label: `Revealed solution — ${loc.lesson.title}` });
  res.json({ solution: loc.lesson.solution, xpIfPassed: Math.round(loc.lesson.xp * 0.2) });
  await store.save();
});

/** Run without consequences: no attempt counted, no XP. */
api.post('/lesson/:id/run', async (req, res) => {
  const p = await store.load();
  const loc = locate(req.params.id);
  if (!loc) return res.status(404).json({ error: 'No such lesson' });
  const code = String(req.body?.code ?? '');
  store.record(p, loc.lesson.id, !!loc.lesson.boss).draft = code;
  const result = await runExercise({
    kind: loc.lesson.kind,
    code,
    tests: loc.lesson.tests,
    fixtures: loc.lesson.fixtures,
  });
  p.stats.sandboxMs += result.ms;
  res.json({ result, rewards: null, alreadyPassed: p.lessons[loc.lesson.id]?.status === 'passed' });
  await store.save();
});

api.post('/lesson/:id/submit', async (req, res) => {
  const p = await store.load();
  const loc = locate(req.params.id);
  if (!loc) return res.status(404).json({ error: 'No such lesson' });
  if (!lessonUnlocked(loc.lesson.id, p)) return res.status(403).json({ error: 'Lesson is locked' });

  const rec = store.record(p, loc.lesson.id, !!loc.lesson.boss);
  const alreadyPassed = rec.status === 'passed';

  let result;
  if (loc.lesson.kind === 'quiz') {
    result = gradeQuiz(loc.lesson.quiz ?? [], req.body?.answers);
  } else {
    const code = String(req.body?.code ?? '');
    rec.draft = code;
    result = await runExercise({
      kind: loc.lesson.kind,
      code,
      tests: loc.lesson.tests,
      fixtures: loc.lesson.fixtures,
    });
    p.stats.sandboxMs += result.ms;
    rec.lastRunMs = result.ms;
  }

  p.stats.submits++;
  if (!alreadyPassed) rec.attempts++;

  let rewards: Rewards | null = null;
  if (result.ok && !alreadyPassed) {
    rewards = applyPass(p, loc.lesson.id);
  } else if (!result.ok) {
    p.combo = 0;
    if (!alreadyPassed) {
      store.log(p, { kind: 'fail', lessonId: loc.lesson.id, label: `Attempt ${rec.attempts} — ${loc.lesson.title}` });
    }
  }

  res.json({
    result,
    rewards,
    alreadyPassed,
    profile: profile(p),
    attempts: rec.attempts,
    /** Show what a pass is currently worth so the cost of hints is visible. */
    xpAtStake: computeXp({
      base: loc.lesson.xp, attempts: rec.attempts,
      hintsUsed: rec.hintsUsed, solutionRevealed: rec.solutionRevealed, combo: p.combo,
    }).total,
  });
  await store.save();
});

function gradeQuiz(quiz: { answer: number[]; explain: string; q: string }[], answers: unknown) {
  const given: number[][] = Array.isArray(answers) ? answers.map((a) => (Array.isArray(a) ? a.map(Number) : [Number(a)])) : [];
  const tests = quiz.map((question, i) => {
    const picked = [...(given[i] ?? [])].sort((a, b) => a - b);
    const want = [...question.answer].sort((a, b) => a - b);
    const passed = picked.length === want.length && picked.every((v, j) => v === want[j]);
    return {
      name: question.q.length > 90 ? question.q.slice(0, 90) + '…' : question.q,
      passed,
      error: passed ? undefined : question.explain,
    };
  });
  return { ok: tests.length > 0 && tests.every((t) => t.passed), tests, logs: [], ms: 0 };
}

api.get('/quiz/:id/explain', async (req, res) => {
  const p = await store.load();
  const loc = locate(req.params.id);
  if (!loc?.lesson.quiz) return res.status(404).json({ error: 'Not a quiz' });
  // Explanations unlock once the quiz is passed, so they can be revisited.
  if (p.lessons[loc.lesson.id]?.status !== 'passed') {
    return res.status(403).json({ error: 'Pass the quiz first' });
  }
  res.json({ answers: loc.lesson.quiz.map((q) => ({ answer: q.answer, explain: q.explain })) });
});

api.post('/reset', async (req, res) => {
  if (req.body?.confirm !== 'RESET') {
    return res.status(400).json({ error: 'Send { confirm: "RESET" } to wipe progress' });
  }
  const p = await store.reset();
  res.json({ ok: true, profile: profile(p) });
});

api.get('/health', (_req, res) => {
  res.json({ ok: true, lessons: totalLessons, xp: totalXp, tracks: tracks.length });
});

app.use('/api', api);

/* ------------------------------------------------------------------ static */

const dist = path.join(root, 'dist');
if (PROD) {
  if (!existsSync(dist)) {
    console.error('No build found. Run `npm run build` first, or use `npm run dev`.');
    process.exit(1);
  }
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Clear any sandbox debris a previous process left behind.
void sweepRunsDir();

app.listen(PORT, () => {
  const label = PROD ? `http://localhost:${PORT}` : `API on http://localhost:${PORT} (UI on the Vite port)`;
  console.log(
    `\n  🎮  bootlocalopus — ${totalLessons} lessons, ${totalXp} XP available across ${tracks.length} tracks\n` +
    `      ${label}\n`,
  );
});
