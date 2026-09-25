const DAY_MS = 86_400_000;

const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

function isBusinessDay(t, holidays) {
  const weekday = new Date(t).getUTCDay(); // 0 = Sunday, 6 = Saturday
  return weekday !== 0 && weekday !== 6 && !holidays.has(isoDay(t));
}

/**
 * The date `n` business days after (or, for negative n, before) `isoDate`.
 * The start date itself is never counted. n = 0 returns the date unchanged.
 * Works on calendar dates in UTC, so no time zone can shift the answer.
 */
export function addBusinessDays(isoDate, n, { holidays = [] } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new TypeError(`expected YYYY-MM-DD, got ${isoDate}`);
  if (!Number.isInteger(n)) throw new RangeError(`n must be a whole number, got ${n}`);

  const off = new Set(holidays);
  const step = 1;
  let t = Date.parse(`${isoDate}T00:00:00Z`);
  let remaining = Math.abs(n);
  while (remaining > 0) {
    t += step * DAY_MS;
    if (isBusinessDay(t, off)) remaining -= 1;
  }
  return isoDay(t);
}
