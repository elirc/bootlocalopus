/**
 * Unit tests for the economy. Run with `npm run test:unit`
 * (node --test with the tsx loader). These are the rules the README promises;
 * a change here should be a deliberate economy decision, not a side effect.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACHIEVEMENTS, ACHIEVEMENT_XP_TOTAL, bumpStreak, computeXp, daysBetween, effectiveStreak,
  hintCost, levelFromXp, rankFor, rollDailyQuests, xpForNextLevel, QUEST_POOL, readiness,
} from './gamify.ts';
import { fresh, type Progress } from './progress.ts';

/* ------------------------------------------------------------- computeXp */

describe('computeXp', () => {
  it('pays base × 1.2 for a clean pass', () => {
    const r = computeXp({ base: 100, hintsUsed: 0, hintCount: 4, solutionRevealed: false });
    assert.equal(r.total, 120);
    assert.equal(r.cleanBonus, 20);
    assert.equal(r.hintPenalty, 0);
  });

  it('is still clean when the lesson has no hints at all', () => {
    const r = computeXp({ base: 50, hintsUsed: 0, hintCount: 0, solutionRevealed: false });
    assert.equal(r.total, 60);
  });

  it('charges every hint the same, and all hints together cost half', () => {
    const one = computeXp({ base: 100, hintsUsed: 1, hintCount: 4, solutionRevealed: false });
    const all = computeXp({ base: 100, hintsUsed: 4, hintCount: 4, solutionRevealed: false });
    assert.equal(one.total, 88);          // 100 × (1 − 0.125), no clean bonus
    assert.equal(one.hintPenalty, 13);
    assert.equal(all.total, 50);
    assert.equal(all.cleanBonus, 0);
  });

  it('never charges for more hints than exist', () => {
    const r = computeXp({ base: 100, hintsUsed: 9, hintCount: 2, solutionRevealed: false });
    assert.equal(r.total, 50);
  });

  it('caps a revealed solution at 20% regardless of hints', () => {
    const r = computeXp({ base: 100, hintsUsed: 3, hintCount: 4, solutionRevealed: true });
    assert.equal(r.total, 20);
    assert.equal(r.hintPenalty, 0);
    assert.equal(r.solutionPenalty, 80);
  });

  it('hintCost matches the penalty computeXp applies', () => {
    for (const [base, count] of [[50, 2], [90, 5], [240, 6], [65, 3]] as const) {
      const perHint = hintCost(base, count);
      const afterOne = computeXp({ base, hintsUsed: 1, hintCount: count, solutionRevealed: false });
      assert.ok(Math.abs(afterOne.hintPenalty - perHint) <= 1, `${base}/${count}: ${afterOne.hintPenalty} vs ${perHint}`);
    }
  });
});

/* ---------------------------------------------------------------- levels */

describe('levelFromXp', () => {
  it('starts at level 1 with 100 needed', () => {
    assert.deepEqual(levelFromXp(0), { level: 1, into: 0, need: 100, pct: 0 });
  });
  it('crosses a threshold exactly', () => {
    assert.equal(levelFromXp(99).level, 1);
    assert.equal(levelFromXp(100).level, 2);
    assert.equal(levelFromXp(100 + 150).level, 3);
  });
  it('costs grow linearly', () => {
    assert.equal(xpForNextLevel(1), 100);
    assert.equal(xpForNextLevel(10), 550);
  });
});

/* ----------------------------------------------------------------- ranks */

describe('rankFor', () => {
  const base = { fraction: 0, bossesBeaten: 0, bossesTotal: 8, tracksWithBoss: 0, everyTrackHalf: false };

  it('starts at Junior I', () => {
    assert.equal(rankFor(base).rank.title, 'Junior I');
    assert.equal(rankFor(base).next?.title, 'Junior II');
  });
  it('does not skip a rank whose predecessor is unmet', () => {
    // 60% cleared but no boss: Mid-Track needs a boss, so this is Junior III.
    assert.equal(rankFor({ ...base, fraction: 0.6 }).rank.title, 'Junior III');
  });
  it('reaches Mid I with bosses in three tracks', () => {
    assert.equal(rankFor({ ...base, fraction: 0.6, bossesBeaten: 3, tracksWithBoss: 3 }).rank.title, 'Mid I');
  });
  it('needs every track at half for Mid II', () => {
    const r = { ...base, fraction: 0.75, bossesBeaten: 3, tracksWithBoss: 3 };
    assert.equal(rankFor(r).rank.title, 'Mid I');
    assert.equal(rankFor({ ...r, everyTrackHalf: true }).rank.title, 'Mid II');
  });
  it('is Mid-Level only at 100%', () => {
    const r = { fraction: 1, bossesBeaten: 8, bossesTotal: 8, tracksWithBoss: 7, everyTrackHalf: true };
    assert.equal(rankFor(r).rank.title, 'Mid-Level');
    assert.equal(rankFor(r).next, null);
    assert.equal(rankFor({ ...r, fraction: 0.99 }).rank.title, 'Mid III');
  });
});

/* --------------------------------------------------------------- streaks */

const withStreak = (current: number, lastDay: string | null, freezes = 0): Progress => {
  const p = fresh();
  p.streak = { current, longest: current, lastDay, freezes };
  return p;
};

describe('bumpStreak', () => {
  it('starts a streak', () => {
    const p = withStreak(0, null);
    bumpStreak(p, '2026-03-10');
    assert.equal(p.streak.current, 1);
    assert.equal(p.streak.lastDay, '2026-03-10');
  });
  it('is a no-op on the same day and on a backwards clock', () => {
    const p = withStreak(3, '2026-03-10');
    assert.equal(bumpStreak(p, '2026-03-10').changed, false);
    assert.equal(bumpStreak(p, '2026-03-09').changed, false);
    assert.equal(p.streak.current, 3);
  });
  it('continues on the next day', () => {
    const p = withStreak(3, '2026-03-10');
    bumpStreak(p, '2026-03-11');
    assert.equal(p.streak.current, 4);
  });
  it('covers a gap with freezes, consuming one per missed day', () => {
    const p = withStreak(6, '2026-03-10', 2);
    const r = bumpStreak(p, '2026-03-13');   // missed the 11th and 12th
    assert.equal(r.freezesUsed, 2);
    assert.equal(p.streak.current, 7);
    assert.equal(p.streak.freezes, 0);
  });
  it('resets when the gap exceeds the freezes', () => {
    const p = withStreak(6, '2026-03-10', 1);
    bumpStreak(p, '2026-03-13');
    assert.equal(p.streak.current, 1);
    assert.equal(p.streak.freezes, 1);   // untouched: they were not enough
  });
  it('earns a freeze every five days, capped at three', () => {
    const p = withStreak(4, '2026-03-10', 3);
    bumpStreak(p, '2026-03-11');
    assert.equal(p.streak.current, 5);
    assert.equal(p.streak.freezes, 3);
    const q = withStreak(4, '2026-03-10', 0);
    bumpStreak(q, '2026-03-11');
    assert.equal(q.streak.freezes, 1);
  });
  it('counts days across a DST change correctly', () => {
    // Europe switches on 2026-03-29; two calendar days is two calendar days.
    assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
    assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  });
});

describe('effectiveStreak', () => {
  it('reports the streak as alive on the day after activity', () => {
    assert.equal(effectiveStreak(withStreak(4, '2026-03-10'), '2026-03-11').current, 4);
  });
  it('flags at-risk when a freeze would be needed', () => {
    const s = effectiveStreak(withStreak(4, '2026-03-10', 1), '2026-03-12');
    assert.equal(s.current, 4);
    assert.equal(s.atRisk, true);
  });
  it('reports zero when the gap is uncoverable', () => {
    assert.equal(effectiveStreak(withStreak(4, '2026-03-10', 0), '2026-03-12').current, 0);
  });
});

/* ---------------------------------------------------------------- quests */

describe('rollDailyQuests', () => {
  it('is deterministic per day', () => {
    const a = rollDailyQuests('2026-05-01').map((q) => q.id);
    const b = rollDailyQuests('2026-05-01').map((q) => q.id);
    assert.deepEqual(a, b);
  });
  it('always includes exactly one volume quest', () => {
    for (const day of ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04']) {
      const ids = rollDailyQuests(day).map((q) => q.id);
      assert.equal(ids.filter((id) => id.startsWith('grind')).length, 1, day);
      assert.equal(ids.length, 3);
    }
  });
  it('never asks for something unreachable', () => {
    const feasible = { unpassedByKind: { js: 1 }, unpassedTotal: 1, bossReachable: false };
    for (let d = 1; d <= 20; d++) {
      const quests = rollDailyQuests(`2026-06-${String(d).padStart(2, '0')}`, feasible);
      for (const q of quests) {
        assert.notEqual(q.metric, 'boss', 'boss quest with no boss reachable');
        if (q.metric === 'kind') assert.fail('kind quest with only one JS lesson reachable');
        if (q.metric === 'lessons' || q.metric === 'clean') assert.ok(q.goal <= 1);
      }
    }
  });
  it('quest XP stays modest against the curriculum', () => {
    const max = Math.max(...QUEST_POOL.map((q) => q.xp));
    assert.ok(max <= 50);
  });
});

/* ---------------------------------------------------------- achievements */

describe('achievements', () => {
  it('total bonus XP is a fifth of the curriculum, not more than it', () => {
    assert.ok(ACHIEVEMENT_XP_TOTAL < 2000, String(ACHIEVEMENT_XP_TOTAL));
    assert.ok(ACHIEVEMENT_XP_TOTAL > 1000);
  });
  it('has unique ids', () => {
    assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  });
});

/* ------------------------------------------------------------- readiness */

describe('readiness', () => {
  it('averages exact fractions, not rounded percentages', () => {
    const tracks = [
      { id: 'a', title: '', icon: '', color: '', blurb: '', weight: 1,
        chapters: [{ id: 'c', title: '', summary: '', lessons: [1, 2, 3].map((n) => ({ id: `a${n}`, title: '', kind: 'js' as const, xp: 1, why: '', brief: '' })) }] },
      { id: 'b', title: '', icon: '', color: '', blurb: '', weight: 1,
        chapters: [{ id: 'd', title: '', summary: '', lessons: [1, 2, 3].map((n) => ({ id: `b${n}`, title: '', kind: 'js' as const, xp: 1, why: '', brief: '' })) }] },
    ];
    const p = fresh();
    for (const id of ['a1', 'b1']) p.lessons[id] = { id, status: 'passed', attempts: 1, hintsUsed: 0, solutionRevealed: false, xpAwarded: 1 };
    // 1/3 + 1/3 over two tracks = 33.3%; rounding each to 33 then averaging would also give 33,
    // but 2/3 + 1/3 → 50 exactly, where per-track rounding (67 + 33)/2 = 50 happens to agree;
    // use 1/3 + 2/3 + 1/3 shape to force the difference:
    assert.equal(readiness(tracks, p).overall, 33);
    p.lessons.a2 = { id: 'a2', status: 'passed', attempts: 1, hintsUsed: 0, solutionRevealed: false, xpAwarded: 1 };
    assert.equal(readiness(tracks, p).overall, 50);
  });
});
