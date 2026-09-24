// No `g` flag: a global regex remembers `lastIndex` between exec() calls.
const LOG_LINE = new RegExp(
  '^(?<ip>[0-9A-Fa-f.:]+)' +
  ' - (?<user>\\S+)' +
  ' \\[(?<time>[^\\]]+)\\]' +
  ' "(?<method>[A-Z]+) (?<path>\\S+) (?<protocol>HTTP\\/\\d(?:\\.\\d)?)"' +
  ' (?<status>\\d{3})' +
  ' (?<bytes>\\d+|-)' +
  ' "(?<referrer>[^"]*)"' +
  ' "(?<userAgent>[^"]*)"$',
  'v',
);

const TIMESTAMP = /^(?<day>\d{2})\/(?<mon>[A-Z][a-z]{2})\/(?<year>\d{4}):(?<h>\d{2}):(?<m>\d{2}):(?<s>\d{2}) (?<sign>[+\-])(?<oh>\d{2})(?<om>\d{2})$/v;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dashToNull = (v) => (v === '-' ? null : v);

function toUtcIso(stamp) {
  const t = TIMESTAMP.exec(stamp)?.groups;
  if (!t) return null;
  const month = MONTHS.indexOf(t.mon);
  if (month === -1) return null;
  const offsetMin = (t.sign === '-' ? -1 : 1) * (Number(t.oh) * 60 + Number(t.om));
  const ms = Date.UTC(Number(t.year), month, Number(t.day), Number(t.h), Number(t.m), Number(t.s)) - offsetMin * 60_000;
  return new Date(ms).toISOString();
}

export function parseLogLine(line) {
  const g = LOG_LINE.exec(String(line))?.groups;
  if (!g) return null;
  const time = toUtcIso(g.time);
  if (time === null) return null;
  return {
    ip: g.ip,
    user: dashToNull(g.user),
    time,
    method: g.method,
    path: g.path,
    protocol: g.protocol,
    status: Number(g.status),
    bytes: g.bytes === '-' ? 0 : Number(g.bytes),
    referrer: dashToNull(g.referrer),
    userAgent: dashToNull(g.userAgent),
  };
}

// Each character can be consumed in exactly one way: a run, then "-run" groups.
// A failing input backtracks linearly instead of trying every split of the runs.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSlug(value) {
  return typeof value === 'string' && SLUG.test(value);
}

export function countEmoji(text) {
  return String(text).match(/\p{RGI_Emoji}/gv)?.length ?? 0;
}

export function highlight(text, term) {
  if (!term) return text;
  return text.replace(new RegExp(RegExp.escape(term), 'giv'), '<mark>$&</mark>');
}
