/**
 * Typed wrappers over the local API. These types are the contract: the server
 * imports them (`import type`) and annotates its responses with them, so a
 * drift between the two halves is a compile error, not a runtime surprise.
 */

export type LessonKind = 'js' | 'ts' | 'typecheck' | 'react' | 'node' | 'sql' | 'node-db' | 'quiz' | 'mutation';
export type LessonStatus = 'new' | 'attempted' | 'passed';

export interface XpBreakdown {
  base: number;
  hintPenalty: number;
  cleanBonus: number;
  solutionPenalty: number;
  total: number;
}

export interface Profile {
  xp: number;
  /** XP from lessons alone, and from badges + quests. Together they make `xp`. */
  xpFromLessons: number;
  xpFromMeta: number;
  level: number;
  levelInto: number;
  levelNeed: number;
  levelPct: number;
  rank: string;
  rankNote: string;
  nextRank: { title: string; needs: string } | null;
  streak: { current: number; longest: number; lastDay: string | null; freezes: number; atRisk: boolean };
  readiness: number;
  trackReadiness: { trackId: string; passed: number; total: number; pct: number }[];
  lessonsPassed: number;
  lessonsTotal: number;
  xpAvailable: number;
  achievementsEarned: number;
  achievementsTotal: number;
  stats: { submits: number; passes: number; hintsOpened: number; sandboxMs: number };
  createdAt: string;
}

export interface LessonSummary {
  id: string;
  title: string;
  kind: LessonKind;
  xp: number;
  boss: boolean;
  why: string;
  status: LessonStatus;
  /** Passed with no hints and no reveal. */
  clean: boolean;
  hintsUsed: number;
  xpAwarded: number;
  unlocked: boolean;
}

export interface ChapterSummary {
  id: string;
  title: string;
  summary: string;
  unlocked: boolean;
  passed: number;
  total: number;
  lessons: LessonSummary[];
}

export interface TrackSummary {
  id: string;
  title: string;
  short: string;
  icon: string;
  color: string;
  blurb: string;
  total: number;
  passed: number;
  chapters: ChapterSummary[];
}

export interface Quest {
  id: string;
  label: string;
  goal: number;
  progress: number;
  xp: number;
  done: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  icon: string;
  xp: number;
  secret: boolean;
  earnedAt: string | null;
  eligible: boolean;
}

export interface HistoryEntry {
  ts: string;
  kind: 'pass' | 'fail' | 'hint' | 'solution' | 'achievement' | 'levelup' | 'quest';
  lessonId?: string;
  label: string;
  xp?: number;
}

export interface AppState {
  profile: Profile;
  tracks: TrackSummary[];
  quests: Quest[];
  achievements: Achievement[];
  history: HistoryEntry[];
  days: Record<string, { lessons: number; xp: number }>;
  nextUp: { id: string; title: string; track: string } | null;
}

export interface QuizQuestionView {
  q: string;
  options: string[];
  multi: boolean;
}

export interface LessonLink {
  id: string;
  title: string;
  unlocked: boolean;
}

export interface LessonDetail {
  id: string;
  title: string;
  kind: LessonKind;
  xp: number;
  boss: boolean;
  why: string;
  brief: string;
  tags: string[];
  starter: string;
  pristineStarter: string;
  hintCount: number;
  /** XP each hint costs on this lesson. */
  hintCost: number;
  hints: string[];
  hasSolution: boolean;
  /** Present once revealed; survives reloads. */
  solution?: string;
  solutionRevealed: boolean;
  quiz?: QuizQuestionView[];
  fixtures?: string;
  /** For `mutation` lessons: the implementation the learner is writing tests against. */
  subject?: string;
  track: { id: string; title: string; color: string; icon: string };
  chapter: { id: string; title: string };
  status: LessonStatus;
  attempts: number;
  hintsUsed: number;
  xpAwarded: number;
  /** What a pass is worth right now, after hints and reveals. */
  xpAtStake: number;
  unlocked: boolean;
  /** Why it is locked, when it is. */
  lockReason?: string;
  next?: LessonLink;
  prev?: LessonLink;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  ms?: number;
}

export interface RunResult {
  ok: boolean;
  tests: TestResult[];
  logs: { level: string; text: string }[];
  error?: string;
  phase?: string;
  ms: number;
  timedOut?: boolean;
  /** The sandbox booted and the clock was started. False means the failure is ours, not the learner's. */
  ready?: boolean;
}

export interface Rewards {
  xp: XpBreakdown | null;
  questXp: number;
  achievementXp: number;
  leveledUp: { from: number; to: number } | null;
  rankedUp: { title: string; note: string } | null;
  newAchievements: { id: string; title: string; detail: string; icon: string; xp: number }[];
  questsFinished: { id: string; label: string; xp: number }[];
  streak: { current: number; freezesUsed: number; longest: number };
}

export interface SubmitResponse {
  result: RunResult;
  rewards: Rewards | null;
  /** False when the sandbox failed to judge the code at all; nothing was counted. */
  scored: boolean;
  alreadyPassed: boolean;
  profile: Profile;
  attempts: number;
  xpAtStake: number;
  status: LessonStatus;
  /** Neighbours recomputed after this request — a pass can unlock `next`. */
  next: LessonLink | undefined;
  prev: LessonLink | undefined;
}

export interface HintResponse {
  hints: string[];
  exhausted: boolean;
  xpAtStake: number;
}

export interface RevealResponse {
  solution: string;
  xpIfPassed: number;
}

/** The local server is not reachable at all — distinct from a 4xx/5xx it sent. */
export class ApiUnavailable extends Error {
  constructor() {
    super('The local server is not responding. Is `npm run dev` (or `npm start`) still running?');
    this.name = 'ApiUnavailable';
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    throw new ApiUnavailable();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? `Request failed with ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  state: () => request<AppState>('/state'),
  lesson: (id: string) => request<LessonDetail>(`/lesson/${id}`),
  /** `keepalive` lets the request outlive the page, for the flush on tab close. */
  saveDraft: (id: string, code: string, opts?: { keepalive?: boolean }) =>
    request<{ ok: true }>(`/lesson/${id}/draft`, {
      method: 'POST',
      body: JSON.stringify({ code }),
      keepalive: opts?.keepalive,
    }),
  run: (id: string, code: string) => post<SubmitResponse>(`/lesson/${id}/run`, { code }),
  submit: (id: string, payload: { code?: string; answers?: number[][] }) =>
    post<SubmitResponse>(`/lesson/${id}/submit`, payload),
  hint: (id: string) => post<HintResponse>(`/lesson/${id}/hint`),
  reveal: (id: string) => post<RevealResponse>(`/lesson/${id}/solution`),
  quizAnswers: (id: string) =>
    request<{ answers: { answer: number[]; explain: string }[] }>(`/quiz/${id}/explain`),
  reset: () => post<{ ok: true; profile: Profile }>('/reset', { confirm: 'RESET' }),
  /** A plain download link, not a fetch: the server sends it as an attachment. */
  exportUrl: '/api/export',
};

export const KIND_LABEL: Record<LessonKind, string> = {
  js: 'JavaScript',
  ts: 'TypeScript',
  typecheck: 'Type-level',
  react: 'React',
  node: 'Node',
  sql: 'Postgres',
  'node-db': 'Node + Postgres',
  quiz: 'Concepts',
  mutation: 'Write the tests',
};

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';
