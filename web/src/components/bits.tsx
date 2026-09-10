import { marked } from 'marked';
import { useMemo } from 'react';
import type { Quest, TestResult, RunResult } from '../api.ts';

/* ------------------------------------------------------------------ markdown */

marked.setOptions({ gfm: true, breaks: false });

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  // Lesson content is authored in this repo, not user input, so rendering it
  // directly is fine — there is no untrusted HTML path here.
  const html = useMemo(() => marked.parse(source) as string, [source]);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* --------------------------------------------------------------------- level */

export function LevelRing({ level, pct }: { level: number; pct: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="ring">
      <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden>
        <circle className="ring-track" cx="52" cy="52" r={radius} fill="none" strokeWidth="7" />
        <circle
          className="ring-fill"
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-label">
        <div className="ring-level">{level}</div>
        <div className="ring-caption">level</div>
      </div>
    </div>
  );
}

export function Bar({ pct, tone }: { pct: number; tone?: 'pass' }) {
  return (
    <div className="bar">
      <div className={`bar-fill${tone ? ' ' + tone : ''}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export function Stat({ value, label, hint }: { value: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- quests */

export function QuestList({ quests }: { quests: Quest[] }) {
  if (!quests.length) return <div className="empty">No quests today.</div>;
  return (
    <div>
      {quests.map((quest) => (
        <div key={quest.id} className={`quest${quest.done ? ' done' : ''}`}>
          <div className="row between">
            <span className="quest-label">
              {quest.done ? '✓ ' : ''}
              {quest.label}
            </span>
            <span className="pill accent">+{quest.xp} XP</span>
          </div>
          <Bar pct={(quest.progress / quest.goal) * 100} tone={quest.done ? 'pass' : undefined} />
          <div className="quest-meta">
            {quest.progress} / {quest.goal}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- results */

export function TestList({ tests }: { tests: TestResult[] }) {
  return (
    <div>
      {tests.map((test, i) => (
        <div key={i} className={`test ${test.passed ? 'pass' : 'fail'}`}>
          <div className="test-name">
            <span className="test-icon">{test.passed ? '✓' : '✕'}</span>
            <span>{test.name}</span>
            {test.ms != null && test.ms > 0 && <span className="test-ms">{test.ms}ms</span>}
          </div>
          {test.error && <div className="test-error">{test.error}</div>}
        </div>
      ))}
    </div>
  );
}

export function ResultPanel({ result, busy }: { result: RunResult | null; busy: boolean }) {
  if (busy) {
    return (
      <div className="results">
        <div className="results-head">Running…</div>
        <div className="test">
          <div className="test-name" style={{ color: 'var(--text-dim)' }}>
            Booting the sandbox and running the graders.
          </div>
        </div>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="results">
        <div className="results-head">Results</div>
        <div className="test">
          <div className="test-name" style={{ color: 'var(--text-faint)' }}>
            Run your code to see the graders. Nothing is judged until you submit.
          </div>
        </div>
      </div>
    );
  }

  const passed = result.tests.filter((t) => t.passed).length;
  return (
    <div className="results">
      <div className="results-head">
        <span>Results</span>
        {result.tests.length > 0 && (
          <span className={`pill ${result.ok ? 'pass' : 'fail'}`}>
            {passed} / {result.tests.length} passing
          </span>
        )}
        <span className="spacer" />
        <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>{result.ms}ms</span>
      </div>

      {result.error && (
        <div className={`banner ${result.timedOut ? 'info' : 'fail'}`}>
          <span>{result.timedOut ? '⏱' : '⚠'}</span>
          <div>
            <strong>
              {result.phase === 'compile'
                ? 'Did not compile'
                : result.phase === 'load'
                  ? 'Threw on load'
                  : result.timedOut
                    ? 'Timed out'
                    : 'Could not run'}
            </strong>
            <pre>{result.error}</pre>
          </div>
        </div>
      )}

      <TestList tests={result.tests} />

      {result.logs.length > 0 && (
        <div className="logs">
          <div className="card-title" style={{ marginBottom: 6 }}>console</div>
          {result.logs.map((log, i) => (
            <div key={i} className={`log-line ${log.level}`}>
              {log.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- misc */

export const KIND_ICON: Record<string, string> = {
  js: 'JS',
  ts: 'TS',
  typecheck: 'T',
  react: '⚛',
  node: '⬢',
  sql: '🐘',
  quiz: '?',
};

export function relativeTime(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
