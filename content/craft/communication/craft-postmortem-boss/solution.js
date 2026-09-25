const MINUTE = 60_000;
const MILESTONES = ['start', 'detected', 'mitigated', 'resolved'];
const BLAME = ['human error', 'should have', 'failed to', 'careless', 'fault'];
const ACTION_TYPES = ['prevent', 'detect', 'mitigate', 'process'];

/** Whole minutes, rounded down: `12 min`, `1 h 5 min`, `2 h`. */
function formatDuration(ms) {
  const minutes = Math.floor(ms / MINUTE);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const formatOffset = (ms) => (ms < 0 ? `-${formatDuration(-ms)}` : `+${formatDuration(ms)}`);
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Sorted by time (stable), exact duplicates removed, with `ms` parsed once. */
function cleanTimeline(events) {
  const seen = new Set();
  return events
    .map((e) => ({ ...e, ms: Date.parse(e.at) }))
    .sort((a, b) => a.ms - b.ms)
    .filter((e) => {
      const key = JSON.stringify([e.ms, e.kind, e.text]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function findProblems(incident, timeline, first, metrics) {
  const problems = [];
  const report = (rule, detail = null) => problems.push({ rule, detail });

  for (const kind of MILESTONES) if (!first.has(kind)) report('missing-event', kind);

  // Each milestone must not come before the nearest earlier milestone that exists.
  let previous = null;
  for (const kind of MILESTONES) {
    if (!first.has(kind)) continue;
    if (previous !== null && first.get(kind) < first.get(previous)) report('event-order', kind);
    previous = kind;
  }

  const prose = [incident.summary, ...timeline.map((e) => e.text)].join('\n');
  for (const phrase of BLAME) {
    if (new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i').test(prose)) report('blame', phrase);
  }

  for (const action of incident.actions) {
    if (!action.owner) report('action-missing-owner', action.text);
    if (!action.due) report('action-missing-due', action.text);
  }
  const types = new Set(incident.actions.map((a) => a.type));
  if (!types.has('prevent')) report('no-prevent-action');
  if (metrics.timeToDetectMin !== null && metrics.timeToDetectMin > 10 && !types.has('detect')) report('no-detect-action');
  return problems;
}

function renderActions(actions) {
  if (actions.length === 0) return 'None.';
  const ordered = [...actions].sort((a, b) => ACTION_TYPES.indexOf(a.type) - ACTION_TYPES.indexOf(b.type));
  const rows = ordered.map((a) => `| ${a.type} | ${a.text.replaceAll('|', '\\|')} | ${a.owner ? `@${a.owner}` : '(unassigned)'} | ${a.due ?? '(none)'} |`);
  return ['| Type | Action | Owner | Due |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

/**
 * Turns incident data into a postmortem document, its headline numbers, and
 * the problems to fix before the review meeting.
 * Returns { markdown, metrics, problems }.
 */
export function buildPostmortem(incident) {
  const timeline = cleanTimeline(incident.events);

  const first = new Map();
  for (const e of timeline) if (MILESTONES.includes(e.kind) && !first.has(e.kind)) first.set(e.kind, e.ms);
  const startMs = first.get('start') ?? timeline[0]?.ms ?? 0;

  const minutesTo = (kind) => (first.has(kind) ? Math.floor((first.get(kind) - startMs) / MINUTE) : null);
  const metrics = {
    timeToDetectMin: minutesTo('detected'),
    timeToMitigateMin: minutesTo('mitigated'),
    timeToResolveMin: minutesTo('resolved'),
  };

  const impactLine = (label, kind) => `- Time to ${label}: ${first.has(kind) ? formatDuration(first.get(kind) - startMs) : 'unknown'}`;
  const sections = [
    `# Postmortem: ${incident.title} (SEV${incident.severity})`,
    `## Summary\n\n${incident.summary}`,
    ['## Impact', '', impactLine('detect', 'detected'), impactLine('mitigate', 'mitigated'), impactLine('resolve', 'resolved')].join('\n'),
    ['## Timeline (UTC)', '', ...timeline.map((e) => `- ${hhmm(e.ms)} (${formatOffset(e.ms - startMs)}) ${e.text}`)].join('\n'),
    `## Action items\n\n${renderActions(incident.actions)}`,
  ];

  return {
    markdown: `${sections.join('\n\n')}\n`,
    metrics,
    problems: findProblems(incident, timeline, first, metrics),
  };
}
