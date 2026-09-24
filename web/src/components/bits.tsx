import { marked } from 'marked';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { HistoryEntry, Quest, RunResult, TestResult } from '../api.ts';

/* ------------------------------------------------------------------ markdown */

marked.setOptions({ gfm: true, breaks: false });

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  // Lesson content is authored in this repo, not user input, so rendering it
  // directly is fine — there is no untrusted HTML path here.
  const html = useMemo(() => marked.parse(source) as string, [source]);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Inline markdown (no block wrapper), for quiz options inside a <label>. */
export function InlineMarkdown({ source }: { source: string }) {
  const html = useMemo(() => marked.parseInline(source) as string, [source]);
  return <span className="md-inline" dangerouslySetInnerHTML={{ __html: html }} />;
}

/* --------------------------------------------------------------------- level */

export function LevelRing({ level, pct }: { level: number; pct: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="ring" role="img" aria-label={`Level ${level}, ${pct}% to the next level`}>
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

export function Bar({ pct, tone, label }: { pct: number; tone?: 'pass'; label?: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div
      className="bar"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={`bar-fill${tone ? ' ' + tone : ''}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Stat({ value, label, hint }: { value: ReactNode; label: string; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

/** A link styled as a button — never nest a <button> inside an <a>. */
export function LinkButton({
  href,
  children,
  primary,
  ghost,
  onClick,
  className = '',
  style,
  initialFocus,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
  ghost?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  /** Focus this first when it sits inside a <Modal>. */
  initialFocus?: boolean;
}) {
  const cls = ['btn', primary ? 'primary' : '', ghost ? 'ghost' : '', className].filter(Boolean).join(' ');
  return (
    <a href={href} className={cls} onClick={onClick} style={style} data-autofocus={initialFocus ? true : undefined}>
      {children}
    </a>
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
          <Bar pct={(quest.progress / quest.goal) * 100} tone={quest.done ? 'pass' : undefined} label={quest.label} />
          <div className="quest-meta">
            {quest.progress} / {quest.goal}
            {quest.done ? ' · complete' : ''}
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
            <span className="test-icon" aria-hidden>{test.passed ? '✓' : '✕'}</span>
            <span className="visually-hidden">{test.passed ? 'passed: ' : 'failed: '}</span>
            <span>{test.name}</span>
            {test.ms != null && test.ms > 0 && <span className="test-ms">{test.ms}ms</span>}
          </div>
          {test.error && <div className="test-error">{test.error}</div>}
        </div>
      ))}
    </div>
  );
}

export function ResultPanel({
  result,
  busy,
  unavailable,
}: {
  result: RunResult | null;
  busy: boolean;
  unavailable?: string | null;
}) {
  const passed = result?.tests.filter((t) => t.passed).length ?? 0;
  const total = result?.tests.length ?? 0;

  return (
    <section className={`results${busy ? ' busy' : ''}`} aria-label="Results">
      <div className="results-head" role="status" aria-live="polite">
        <span>{busy ? 'Running…' : 'Results'}</span>
        {result && total > 0 && !busy && (
          <span className={`pill ${result.ok ? 'pass' : 'fail'}`}>
            {result.ok ? '✓ ' : ''}{passed} / {total} passing
          </span>
        )}
        <span className="spacer" />
        {result && !busy && <span className="faint">{result.ms}ms</span>}
      </div>

      {unavailable && (
        <div className="banner info">
          <span aria-hidden>⚠</span>
          <div>{unavailable}</div>
        </div>
      )}

      {!result && !unavailable && (
        <div className="test">
          <div className="test-name faint">
            {busy
              ? 'Booting the sandbox and running the graders.'
              : 'Run your code to see the graders. Nothing is judged until you submit.'}
          </div>
        </div>
      )}

      {result?.error && (
        <div className={`banner ${result.timedOut ? 'info' : 'fail'}`}>
          <span aria-hidden>{result.timedOut ? '⏱' : '⚠'}</span>
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

      {result && <TestList tests={result.tests} />}

      {result && result.logs.length > 0 && (
        <div className="logs">
          <div className="card-title" style={{ marginBottom: 6 }}>console</div>
          {result.logs.map((log, i) => (
            <div key={i} className={`log-line ${log.level}`}>
              {log.text}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------------------- modal */

/**
 * A real <dialog>: focus moves in, Escape closes, and focus returns to the
 * opener. A backdrop click is deliberately NOT a close — reward cards carry
 * information the learner may want to read.
 *
 * The element to focus first is marked `data-autofocus`; React's `autoFocus`
 * cannot work here because it fires while the dialog is still hidden.
 * `onClose` fires at most once per open, however the dialog was dismissed.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  /** Set once this open has been reported closed; reset on every open. */
  const closed = useRef(true);
  /** Where focus was before opening, for the fallback path (native showModal restores it itself). */
  const opener = useRef<HTMLElement | null>(null);

  const requestClose = () => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      closed.current = false;
      // jsdom and very old browsers lack showModal; fall back to the attribute.
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.setAttribute('open', '');
      }
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      // The parent already knows: do not report this close back to it.
      closed.current = true;
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
        opener.current?.focus();
        opener.current = null;
      }
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' wide' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        // Let the parent decide: it closes us by flipping `open`.
        e.preventDefault();
        requestClose();
      }}
      onClose={requestClose}
      onKeyDown={(e) => {
        // The fallback path has no native Escape handling.
        if (e.key === 'Escape' && typeof ref.current?.showModal !== 'function') requestClose();
      }}
    >
      {open && children}
    </dialog>
  );
}

/** A confirm dialog that does not use window.confirm. */
export function Confirm({
  open,
  title,
  body,
  confirmLabel = 'Continue',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <h2 className="modal-title">{title}</h2>
      <div className="modal-body">{body}</div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
        {/* A destructive confirm starts on Cancel, so a stray Enter cannot erase anything. */}
        <button className="ghost" onClick={onCancel} data-autofocus={danger ? true : undefined}>
          Cancel
        </button>
        <button className={danger ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus={danger ? undefined : true}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ timeline */

const GLYPH: Record<HistoryEntry['kind'], string> = {
  pass: '✓',
  fail: '✕',
  achievement: '★',
  levelup: '▲',
  quest: '◆',
  hint: '·',
  solution: '·',
};

export function Timeline({ entries, limit, showKind }: { entries: HistoryEntry[]; limit?: number; showKind?: boolean }) {
  const shown = limit ? entries.slice(0, limit) : entries;
  if (!shown.length) return <div className="empty">Nothing yet — clear a lesson and it will show up here.</div>;
  return (
    <div>
      {shown.map((entry, i) => (
        <div className={`timeline-item kind-${entry.kind}`} key={i}>
          {showKind ? (
            <span className="timeline-kind">{entry.kind}</span>
          ) : (
            <span className="timeline-glyph" aria-hidden>{GLYPH[entry.kind]}</span>
          )}
          <span className="timeline-label">
            {entry.lessonId ? <a href={`#/lesson/${entry.lessonId}`}>{entry.label}</a> : entry.label}
          </span>
          {entry.xp ? <span className="timeline-xp">+{entry.xp}</span> : null}
          <span className="timeline-when">{relativeTime(entry.ts)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- misc */

export function relativeTime(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** Keep the document title in step with the screen. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · bootlocalopus` : 'bootlocalopus';
  }, [title]);
}
