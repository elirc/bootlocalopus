const DAY_MS = 24 * 60 * 60 * 1000;
const formatters = new Map();

/** Wall-clock fields of an instant in a zone: { year, month (1-12), day, hour, minute, second }. */
function fieldsIn(ms, timeZone) {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(timeZone, fmt);
  }
  const out = {};
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out;
}

/** The zone's offset from UTC at an instant, in ms (positive east of Greenwich). */
function offsetAt(ms, timeZone) {
  const f = fieldsIn(ms, timeZone);
  const wholeSecond = Math.floor(ms / 1000) * 1000;
  return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - wholeSecond;
}

/**
 * Wall-clock time in a zone -> instant (ms). `wall` is the wall time encoded as
 * if it were UTC. Ambiguous (fall back): the earlier instant. Nonexistent
 * (spring forward): pushed later by the length of the gap.
 */
function wallToInstant(wall, timeZone) {
  const before = offsetAt(wall - DAY_MS, timeZone);
  const after = offsetAt(wall + DAY_MS, timeZone);
  const valid = [...new Set([before, after])]
    .map((offset) => wall - offset)
    .filter((t) => offsetAt(t, timeZone) === wall - t);
  if (valid.length) return Math.min(...valid);
  return wall - before;
}

export function startOfDayInZone(date, timeZone) {
  const f = fieldsIn(date.getTime(), timeZone);
  return new Date(wallToInstant(Date.UTC(f.year, f.month - 1, f.day), timeZone));
}

export function sameTimeTomorrow(date, timeZone) {
  const ms = date.getTime();
  const f = fieldsIn(ms, timeZone);
  const millis = ((ms % 1000) + 1000) % 1000;
  const tomorrow = Date.UTC(f.year, f.month - 1, f.day + 1, f.hour, f.minute, f.second, millis);
  return new Date(wallToInstant(tomorrow, timeZone));
}

const DATE_RE = /^(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})$/;
const daysIn = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
const pad = (n, w = 2) => String(n).padStart(w, '0');

export function addMonths(isoDate, n) {
  const match = DATE_RE.exec(String(isoDate));
  if (!match) throw new RangeError(`not a YYYY-MM-DD date: ${isoDate}`);
  const y = Number(match.groups.y), m = Number(match.groups.m), d = Number(match.groups.d);
  if (m < 1 || m > 12 || d < 1 || d > daysIn(y, m - 1)) throw new RangeError(`no such date: ${isoDate}`);
  if (!Number.isInteger(n)) throw new RangeError('n must be an integer');
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = total - ty * 12;
  return `${pad(ty, 4)}-${pad(tm + 1)}-${pad(Math.min(d, daysIn(ty, tm)))}`;
}

const INSTANT_RE = /^(?<y>\d{4})-(?<mo>\d{2})-(?<d>\d{2})T(?<h>\d{2}):(?<mi>\d{2})(?::(?<s>\d{2})(?:\.\d{1,9})?)?(?<off>Z|[+-]\d{2}:\d{2})$/;

export function parseInstant(text) {
  const match = INSTANT_RE.exec(String(text));
  if (!match) throw new RangeError(`not an ISO date-time with an offset: ${text}`);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new RangeError(`invalid date-time: ${text}`);
  // Date rolls 30 February into March; read the wall fields back in the same offset and compare.
  const { y, mo, d, h, mi, s = '00', off } = match.groups;
  const offsetMin = off === 'Z' ? 0 : (off[0] === '-' ? -1 : 1) * (Number(off.slice(1, 3)) * 60 + Number(off.slice(4)));
  const wall = new Date(date.getTime() + offsetMin * 60_000);
  const same = wall.getUTCFullYear() === Number(y) && wall.getUTCMonth() + 1 === Number(mo) &&
    wall.getUTCDate() === Number(d) && wall.getUTCHours() === Number(h) &&
    wall.getUTCMinutes() === Number(mi) && wall.getUTCSeconds() === Number(s);
  if (!same) throw new RangeError(`no such date-time: ${text}`);
  return date;
}

export function formatPrice(minor, currency, locale) {
  if (!Number.isSafeInteger(minor)) throw new RangeError('minor must be an integer amount in the minor unit');
  const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits;
  return fmt.format(minor / 10 ** digits);
}
