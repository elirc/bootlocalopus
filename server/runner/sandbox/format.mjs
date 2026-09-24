/**
 * Turning values into text: failure messages and console capture.
 *
 * `show()` is only ever called when a message is actually needed (a failing
 * assertion, a log line). Formatting eagerly would run the learner's getters
 * once per `expect()` call, which changes what the next assertion sees.
 */
import { inspect } from 'node:util';
import * as P from './primordials.mjs';

const INSPECT = {
  depth: 4,
  maxArrayLength: 20,
  maxStringLength: 200,
  breakLength: 80,
  compact: 3,
  sorted: true,
  getters: false,
};

const isError = (v) => v instanceof Error || P.ObjectPrototypeToString(v) === '[object Error]';

export function show(v) {
  try {
    if (isError(v)) {
      const head = String(v.name || 'Error') + ': ' + String(v.message);
      const own = P.ObjectKeys(v);
      return own.length ? head + ' ' + inspect(Object.fromEntries(own.map((k) => [k, v[k]])), INSPECT) : head;
    }
    return inspect(v, INSPECT);
  } catch {
    try { return String(v); } catch { return '[unprintable value]'; }
  }
}

/** An Error with its first few stack frames, the way a console prints it. */
function showErrorWithStack(err) {
  const head = String(err.name || 'Error') + ': ' + String(err.message);
  const frames = String(err.stack || '').split('\n').filter((l) => /^\s+at /.test(l)).slice(0, 3);
  return [head, ...frames.map((l) => '    ' + l.trim())].join('\n');
}

/** How a console.log argument prints: strings raw, errors with a short stack, everything else inspected. */
export function formatArg(a) {
  if (typeof a === 'string') return a;
  try {
    if (isError(a)) return showErrorWithStack(a);
  } catch { /* fall through */ }
  return show(a);
}

/**
 * The one place log text is accepted. Limits: entry count, characters per
 * entry, characters in total. Anything past a limit is counted, not kept, and
 * the count is reported as one final entry.
 */
export function createLogSink({ maxEntries = 200, maxEntryChars = 2_000, maxTotalChars = 64_000, onEntry } = {}) {
  const entries = [];
  let total = 0;
  let dropped = 0;
  const sink = {
    /** When set (mutation runs of hidden variants), everything is discarded silently. */
    quiet: false,
    pushText(level, text) {
      if (sink.quiet) return;
      let t = String(text);
      if (t.length > maxEntryChars) t = t.slice(0, maxEntryChars) + ` … (${(t.length - maxEntryChars).toLocaleString()} more characters)`;
      if (entries.length >= maxEntries || total + t.length > maxTotalChars) {
        dropped++;
        return;
      }
      total += t.length;
      const entry = { level: level === 'warn' || level === 'error' ? level : 'log', text: t };
      entries.push(entry);
      if (onEntry) onEntry(entry);
    },
    push(level, args) {
      if (sink.quiet) return;
      let text;
      try {
        text = args.map(formatArg).join(' ');
      } catch {
        text = '[unprintable log arguments]';
      }
      sink.pushText(level, text);
    },
    entries: () => entries,
    dropped: () => dropped,
  };
  return sink;
}
