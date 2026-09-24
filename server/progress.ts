/**
 * Single-player save file. One JSON document, written atomically, backed up
 * daily, and never overwritten by something we could not read.
 *
 * No database on purpose: the app should survive being copied to a USB stick.
 * The cost of that choice is that every durability guarantee in here is ours
 * to keep: fsync before rename, a quarantine path for a corrupt file, a lock so
 * two processes cannot share one save, and a migration step keyed on `version`.
 */
import { readFile, writeFile, rename, mkdir, open, readdir, copyFile, unlink, stat } from 'node:fs/promises';
import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayKey, rollDailyQuests, type Quest, type QuestFeasibility } from './gamify.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Overridable so tests and the e2e suite never touch the real save. */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(here, '..', 'data');
const FILE = path.join(DATA_DIR, 'progress.json');
const BACKUPS = path.join(DATA_DIR, 'backups');
const LOCK = path.join(DATA_DIR, '.lock');
const KEEP_BACKUPS = 14;

export const SAVE_VERSION = 2;

export interface PassSnapshot {
  attempts: number;
  hintsUsed: number;
  solutionRevealed: boolean;
  at: string;
}

export interface LessonRecord {
  id: string;
  /** `new` = touched (draft, hint, run) but never submitted; `attempted` = a scored failure. */
  status: 'new' | 'attempted' | 'passed';
  /** Scored submits, including the one that passed. */
  attempts: number;
  hintsUsed: number;
  solutionRevealed: boolean;
  /** Frozen at the moment of passing; later hints/reveals never change what it was worth. */
  pass?: PassSnapshot;
  solvedAt?: string;
  xpAwarded: number;
  boss?: boolean;
  /** Unsaved editor buffer, so a reload never loses work. */
  draft?: string;
  lastRunMs?: number;
  lastTouchedAt?: string;
}

export interface HistoryEntry {
  ts: string;
  kind: 'pass' | 'fail' | 'hint' | 'solution' | 'achievement' | 'levelup' | 'quest';
  lessonId?: string;
  label: string;
  xp?: number;
}

export interface DayStats {
  lessons: number;
  xp: number;
  clean: number;
  bosses: number;
  kinds: Record<string, number>;
}

export interface Progress {
  version: number;
  createdAt: string;
  xp: number;
  xpFromLessons: number;
  xpFromMeta: number;
  lessons: Record<string, LessonRecord>;
  days: Record<string, DayStats>;
  streak: { current: number; longest: number; lastDay: string | null; freezes: number };
  achievements: Record<string, string>;
  daily: { day: string; quests: Quest[] };
  history: HistoryEntry[];
  stats: { submits: number; passes: number; hintsOpened: number; sandboxMs: number };
}

export const emptyDay = (): DayStats => ({ lessons: 0, xp: 0, clean: 0, bosses: 0, kinds: {} });

export const fresh = (): Progress => ({
  version: SAVE_VERSION,
  createdAt: new Date().toISOString(),
  xp: 0,
  xpFromLessons: 0,
  xpFromMeta: 0,
  lessons: {},
  days: {},
  streak: { current: 0, longest: 0, lastDay: null, freezes: 0 },
  achievements: {},
  daily: { day: dayKey(), quests: rollDailyQuests() },
  history: [],
  stats: { submits: 0, passes: 0, hintsOpened: 0, sandboxMs: 0 },
});

/* ---------------------------------------------------------------- migrate */

type Migration = (p: Progress & Record<string, unknown>) => void;

/** Keyed by the version they upgrade FROM. */
const MIGRATIONS: Record<number, Migration> = {
  1: (p) => {
    // v1 had a first-try/combo economy and no frozen pass snapshot.
    for (const rec of Object.values(p.lessons)) {
      if (rec.status === 'passed' && !rec.pass) {
        rec.pass = {
          attempts: rec.attempts,
          hintsUsed: rec.hintsUsed,
          solutionRevealed: rec.solutionRevealed,
          at: rec.solvedAt ?? p.createdAt,
        };
      }
    }
    for (const day of Object.values(p.days) as Array<DayStats & { firstTry?: number; noHints?: number }>) {
      day.clean ??= day.noHints ?? 0;
      delete day.firstTry;
      delete day.noHints;
    }
    p.xpFromLessons ??= Object.values(p.lessons).reduce((s, r) => s + (r.xpAwarded ?? 0), 0);
    p.xpFromMeta ??= Math.max(0, p.xp - p.xpFromLessons);
    delete p.combo;
    p.version = 2;
  },
};

/** Fill any missing nested defaults; a save from an older build may lack keys. */
function withDefaults(raw: Partial<Progress>): Progress {
  const base = fresh();
  const p: Progress = {
    ...base,
    ...raw,
    streak: { ...base.streak, ...(raw.streak ?? {}) },
    stats: { ...base.stats, ...(raw.stats ?? {}) },
    daily: raw.daily?.quests ? raw.daily : base.daily,
    lessons: raw.lessons ?? {},
    days: Object.fromEntries(
      Object.entries(raw.days ?? {}).map(([k, v]) => [k, { ...emptyDay(), ...v, kinds: { ...(v?.kinds ?? {}) } }]),
    ),
    achievements: raw.achievements ?? {},
    history: raw.history ?? [],
  };
  let version = typeof raw.version === 'number' ? raw.version : 1;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    step(p as Progress & Record<string, unknown>);
    version = p.version;
  }
  p.version = SAVE_VERSION;
  return p;
}

/* ------------------------------------------------------------------- load */

let cache: Progress | null = null;

async function newestBackup(): Promise<string | null> {
  try {
    const files = (await readdir(BACKUPS)).filter((f) => f.startsWith('progress-') && f.endsWith('.json')).sort();
    return files.length ? path.join(BACKUPS, files[files.length - 1]) : null;
  } catch {
    return null;
  }
}

export async function load(): Promise<Progress> {
  if (cache) return cache;
  await mkdir(DATA_DIR, { recursive: true });

  let raw: string | null = null;
  try {
    raw = await readFile(FILE, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[progress] cannot read save file:', (e as Error).message);
      raw = await quarantineAndRecover();
    }
  }

  if (raw !== null) {
    try {
      cache = withDefaults(JSON.parse(raw));
    } catch (e) {
      console.error('[progress] save file is not valid JSON:', (e as Error).message);
      const recovered = await quarantineAndRecover();
      cache = recovered ? withDefaults(JSON.parse(recovered)) : fresh();
    }
  } else {
    cache = fresh();
  }
  return cache;
}

/** Move the unreadable file aside (never overwrite it) and try the newest backup. */
async function quarantineAndRecover(): Promise<string | null> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await rename(FILE, path.join(DATA_DIR, `progress.corrupt-${stamp}.json`));
    console.error(`[progress] quarantined the unreadable save as progress.corrupt-${stamp}.json`);
  } catch { /* nothing to move */ }
  const backup = await newestBackup();
  if (!backup) {
    console.error('[progress] no backup found; starting fresh');
    return null;
  }
  console.error(`[progress] restored from ${path.basename(backup)}`);
  return readFile(backup, 'utf8');
}

/* ------------------------------------------------------------------- save */

let dirty = false;
let writing: Promise<void> | null = null;
let lastBackupDay: string | null = null;

async function writeAtomic(target: string, contents: string) {
  const tmp = `${target}.${process.pid}.tmp`;
  const fh = await open(tmp, 'w');
  try {
    await fh.writeFile(contents, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  // Windows can refuse the rename for a moment if a reader still has the file.
  for (const delay of [0, 50, 200, 800]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      await rename(tmp, target);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY') throw e;
    }
  }
  throw new Error('could not replace the save file: still locked');
}

async function backupIfNewDay(p: Progress) {
  const today = dayKey();
  if (lastBackupDay === today) return;
  lastBackupDay = today;
  await mkdir(BACKUPS, { recursive: true });
  const dest = path.join(BACKUPS, `progress-${today}.json`);
  try {
    await stat(dest);
    return;   // already have today's
  } catch { /* fall through */ }
  try {
    await copyFile(FILE, dest);
  } catch {
    // First run of all time: nothing to back up yet.
    return;
  }
  const files = (await readdir(BACKUPS)).filter((f) => f.startsWith('progress-')).sort();
  for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
    await unlink(path.join(BACKUPS, old)).catch(() => {});
  }
  void p;
}

/**
 * Serialised and coalesced: concurrent callers share one write, and a call
 * made during a write schedules exactly one more. Resolves once the caller's
 * state is on disk.
 */
export function save(): Promise<void> {
  const snapshot = cache;
  if (!snapshot) return Promise.resolve();
  dirty = true;
  if (writing) return writing.then(() => (dirty ? save() : undefined));
  writing = (async () => {
    while (dirty) {
      dirty = false;
      await backupIfNewDay(snapshot);
      await writeAtomic(FILE, JSON.stringify(snapshot, null, 2));
    }
  })()
    .catch((e) => {
      console.error('[progress] save failed:', (e as Error).message);
      throw e;
    })
    .finally(() => {
      writing = null;
    });
  return writing;
}

export async function reset(): Promise<Progress> {
  await mkdir(BACKUPS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await copyFile(FILE, path.join(BACKUPS, `progress.pre-reset-${stamp}.json`)).catch(() => {});
  cache = fresh();
  await save();
  return cache;
}

/* ------------------------------------------------------------------- lock */

/** Two servers sharing one save would silently overwrite each other. Refuse. */
export async function acquireLock(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const existing = JSON.parse(await readFile(LOCK, 'utf8')) as { pid: number; startedAt: string };
    if (existing.pid !== process.pid && isAlive(existing.pid)) {
      throw new Error(
        `Another server (pid ${existing.pid}, started ${existing.startedAt}) is using ${DATA_DIR}. ` +
        `Stop it first, or point this one at a different DATA_DIR.`,
      );
    }
  } catch (e) {
    if ((e as Error).message.startsWith('Another server')) throw e;
    // Missing or unreadable lock: ours to take.
  }
  await writeFile(LOCK, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  const release = () => { try { unlinkSync(LOCK); } catch { /* gone */ } };
  process.once('exit', release);
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- helpers */

export function record(p: Progress, lessonId: string, boss = false): LessonRecord {
  p.lessons[lessonId] ??= {
    id: lessonId, status: 'new', attempts: 0, hintsUsed: 0,
    solutionRevealed: false, xpAwarded: 0, boss,
  };
  return p.lessons[lessonId];
}

export function today(p: Progress, key = dayKey()) {
  p.days[key] ??= emptyDay();
  return p.days[key];
}

/** Roll the quest board when the day turns over; returns true if it did. */
export function ensureDay(p: Progress, key = dayKey(), feasible?: QuestFeasibility) {
  if (p.daily.day === key) return false;
  p.daily = { day: key, quests: rollDailyQuests(key, feasible) };
  return true;
}

export function log(p: Progress, entry: Omit<HistoryEntry, 'ts'>, ts = new Date().toISOString()) {
  p.history.unshift({ ts, ...entry });
  if (p.history.length > 300) p.history.length = 300;
}
