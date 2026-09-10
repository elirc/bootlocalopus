/** Typed wrappers over the local API. Shapes mirror server/index.ts. */

export type LessonKind = 'js' | 'ts' | 'typecheck' | 'react' | 'node' | 'sql' | 'quiz';
export type LessonStatus = 'new' | 'attempted' | 'passed';

export interface Profile {
  xp: number;
  level: number;
  levelInto: number;
  levelNeed: number;
  levelPct: number;
  rank: string;
  rankNote: string;
  nextRank: { title: string; atLevel: number } | null;
  combo: number;
  comboMultiplier: number;
  streak: { current: number; longest: number; lastDay: string | null; freezes: number };
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
  firstTry: boolean;
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
  hints: string[];
  hasSolution: boolean;
  solution?: string;
  quiz?: QuizQuestionView[];
  fixtures?: string;
  track: { id: string; title: string; color: string; icon: string };
  chapter: { id: string; title: string };
  status: LessonStatus;
  attempts: number;
  xpAwarded: number;
  unlocked: boolean;
  next?: string;
  prev?: string;
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
}

export interface Rewards {
  xp: {
    base: number;
    hintPenalty: number;
    firstTryBonus: number;
    comboBonus: number;
    solutionPenalty: number;
    total: number;
    combo: number;
  } | null;
  questXp: number;
  achievementXp: number;
  leveledUp: { from: number; to: number; rank: string } | null;
  newAchievements: { id: string; title: string; detail: string; icon: string; xp: number }[];
  questsFinished: { id: string; label: string; xp: number }[];
  streak: { current: number; usedFreeze: boolean; longest: number };
  combo: number;
}

export interface SubmitResponse {
  result: RunResult;
  rewards: Rewards | null;
  alreadyPassed: boolean;
  profile?: Profile;
  attempts?: number;
  xpAtStake?: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  state: () => request<AppState>('/state'),
  lesson: (id: string) => request<LessonDetail>(`/lesson/${id}`),
  saveDraft: (id: string, code: string) => post<{ ok: true }>(`/lesson/${id}/draft`, { code }),
  run: (id: string, code: string) => post<SubmitResponse>(`/lesson/${id}/run`, { code }),
  submit: (id: string, payload: { code?: string; answers?: number[][] }) =>
    post<SubmitResponse>(`/lesson/${id}/submit`, payload),
  hint: (id: string) =>
    post<{ hints: string[]; exhausted: boolean; xpAtStake?: number }>(`/lesson/${id}/hint`),
  reveal: (id: string) => post<{ solution: string; xpIfPassed: number }>(`/lesson/${id}/solution`),
  quizAnswers: (id: string) =>
    request<{ answers: { answer: number[]; explain: string }[] }>(`/quiz/${id}/explain`),
  reset: () => post<{ ok: true }>('/reset', { confirm: 'RESET' }),
};

export const KIND_LABEL: Record<LessonKind, string> = {
  js: 'JavaScript',
  ts: 'TypeScript',
  typecheck: 'Type-level',
  react: 'React',
  node: 'Node',
  sql: 'Postgres',
  quiz: 'Concepts',
};

/** CodeMirror language per lesson kind. */
export const KIND_LANG: Record<LessonKind, 'javascript' | 'typescript' | 'jsx' | 'sql' | 'none'> = {
  js: 'javascript',
  ts: 'typescript',
  typecheck: 'typescript',
  react: 'jsx',
  node: 'javascript',
  sql: 'sql',
  quiz: 'none',
};
