/**
 * Single-player save file. One JSON document, written atomically.
 * No database on purpose: the app should survive being copied to a USB stick.
 */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayKey, rollDailyQuests, type Quest } from './gamify.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(here, '..', 'data');
const FILE = path.join(DATA_DIR, 'progress.json');

export interface LessonRecord {
  id: string;
  status: 'passed' | 'attempted';
  /** Total submits, including the one that passed. */
  attempts: number;
  hintsUsed: number;
  solutionRevealed: boolean;
  firstTry: boolean;
  solvedAt?: string;
  xpAwarded: number;
  boss?: boolean;
  /** Unsaved editor buffer, so a reload never loses work. */
  draft?: string;
  lastRunMs?: number;
}

export interface HistoryEntry {
  ts: string;
  kind: 'pass' | 'fail' | 'hint' | 'solution' | 'achievement' | 'levelup' | 'quest';
  lessonId?: string;
  label: string;
  xp?: number;
}

export interface Progress {
  version: number;
  createdAt: string;
  xp: number;
  /** Consecutive first-try passes. */
  combo: number;
  lessons: Record<string, LessonRecord>;
  days: Record<string, { lessons: number; xp: number; firstTry: number; noHints: number; bosses: number; kinds: Record<string, number> }>;
  streak: { current: number; longest: number; lastDay: string | null; freezes: number };
  achievements: Record<string, string>;
  daily: { day: string; quests: Quest[] };
  history: HistoryEntry[];
  stats: { submits: number; passes: number; hintsOpened: number; sandboxMs: number };
}

export const emptyDay = () => ({ lessons: 0, xp: 0, firstTry: 0, noHints: 0, bosses: 0, kinds: {} as Record<string, number> });

const fresh = (): Progress => ({
  version: 1,
  createdAt: new Date().toISOString(),
  xp: 0,
  combo: 0,
  lessons: {},
  days: {},
  streak: { current: 0, longest: 0, lastDay: null, freezes: 1 },
  achievements: {},
  daily: { day: dayKey(), quests: rollDailyQuests() },
  history: [],
  stats: { submits: 0, passes: 0, hintsOpened: 0, sandboxMs: 0 },
});

let cache: Progress | null = null;
let writing: Promise<void> = Promise.resolve();

export async function load(): Promise<Progress> {
  if (cache) return cache;
  try {
    const raw = await readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as Progress;
    cache = { ...fresh(), ...parsed };
    // Roll the quest board when the day turns over.
    if (cache.daily.day !== dayKey()) {
      cache.daily = { day: dayKey(), quests: rollDailyQuests() };
    }
  } catch {
    cache = fresh();
  }
  return cache;
}

/** Serialized, atomic save. Concurrent callers queue rather than interleave. */
export function save(): Promise<void> {
  const snapshot = cache;
  if (!snapshot) return Promise.resolve();
  writing = writing.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
    await rename(tmp, FILE);
  }).catch((e) => {
    console.error('[progress] save failed:', e.message);
  });
  return writing;
}

export async function reset(): Promise<Progress> {
  cache = fresh();
  await save();
  return cache;
}

export function record(p: Progress, lessonId: string, boss = false): LessonRecord {
  p.lessons[lessonId] ??= {
    id: lessonId, status: 'attempted', attempts: 0, hintsUsed: 0,
    solutionRevealed: false, firstTry: false, xpAwarded: 0, boss,
  };
  return p.lessons[lessonId];
}

export function today(p: Progress) {
  const key = dayKey();
  p.days[key] ??= emptyDay();
  return p.days[key];
}

export function log(p: Progress, entry: Omit<HistoryEntry, 'ts'>) {
  p.history.unshift({ ts: new Date().toISOString(), ...entry });
  if (p.history.length > 300) p.history.length = 300;
}
