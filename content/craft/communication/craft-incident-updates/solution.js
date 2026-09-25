const MINUTE = 60_000;
const CADENCE_MIN = { 1: 30, 2: 60, 3: 120 };
const FIVE_MIN = 5 * MINUTE;

/** `HH:MM UTC`, with the date in front when it is not `now`'s UTC date. */
function formatTime(ms, now) {
  const iso = new Date(ms).toISOString(); // always UTC: 2024-05-01T14:05:00.000Z
  const sameDay = iso.slice(0, 10) === new Date(now).toISOString().slice(0, 10);
  return `${sameDay ? '' : `${iso.slice(0, 10)} `}${iso.slice(11, 16)} UTC`;
}

/** Whole minutes, rounded down: `47 min`, `1 h 12 min`, `2 h`. */
function formatDuration(ms) {
  const minutes = Math.floor(ms / MINUTE);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A customer-facing incident update, and when the next one is due.
 * Returns { text, nextUpdateAt }.
 */
export function composeUpdate(incident, now) {
  if (typeof incident.impact !== 'string' || incident.impact.trim() === '') throw new Error('impact is required');

  const started = Date.parse(incident.startedAt);
  const lines = [`[SEV${incident.severity}] ${capitalise(incident.status)}: ${incident.title}`, `Impact: ${incident.impact}`];

  if (incident.status === 'resolved') {
    const resolved = Date.parse(incident.resolvedAt);
    lines.push(`Started: ${formatTime(started, now)}, resolved ${formatTime(resolved, now)} (lasted ${formatDuration(resolved - started)})`);
    return { text: lines.join('\n'), nextUpdateAt: null };
  }

  lines.push(`Started: ${formatTime(started, now)} (${formatDuration(now - started)} ago)`);
  if (incident.workaround !== null && incident.workaround !== undefined) lines.push(`Workaround: ${incident.workaround}`);

  // Promise a time you can keep: round up to a whole five minutes.
  const next = Math.ceil((now + CADENCE_MIN[incident.severity] * MINUTE) / FIVE_MIN) * FIVE_MIN;
  lines.push(`Next update: by ${formatTime(next, now)}`);
  return { text: lines.join('\n'), nextUpdateAt: new Date(next).toISOString() };
}
