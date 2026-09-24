import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'js-text-time',
  title: 'Text, numbers and time',
  summary: 'Time zones, DST, money formatting and regular expressions: the everyday code that is wrong twice a year or on one hostile input.',
  lessons: [
    {
      id: 'js-dates-tz',
      title: 'Dates without tears',
      kind: 'js',
      xp: 100,
      why: '"Send the reminder at 9am tomorrow" is wrong twice a year if you add 24 hours, and "$19.99" is wrong in Tokyo. Both reach production because they pass every test written in June.',
      tags: ['dates', 'time zones', 'DST', 'Intl'],
      hints: [
        'Everything hangs off one helper: the wall-clock fields of an instant in a zone. `new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(date)` gives you `{ type, value }` parts; keep the non-literal ones as numbers.',
        'The zone\'s UTC offset at an instant is `Date.UTC(...thoseFields) - instantMs` (drop the instant\'s milliseconds first — the parts have none). Offsets change across a DST switch, so never reuse "the current offset" for a different day.',
        'To turn a wall-clock time back into an instant: `wall = Date.UTC(fields)`, then try `wall - offsetAt(wall - 1 day)` and `wall - offsetAt(wall + 1 day)`. Keep the candidates whose own offset agrees (`offsetAt(t) === wall - t`); if both do, the time is ambiguous — take the earlier; if neither does, it is in a gap — use `wall - offsetAt(wall - 1 day)`, which lands the length of the gap later.',
        '`startOfDayInZone` is then "fields of the instant, with hour/minute/second/ms set to 0, back to an instant". `sameTimeTomorrow` is "fields of the instant with `day + 1`" — let `Date.UTC` normalise day 32 into the next month, read the fields back with `getUTC*`, then convert.',
        '`addMonths`: `total = year * 12 + (month - 1) + n`, `y = Math.floor(total / 12)`, `m = total - y * 12`, and clamp the day to `new Date(Date.UTC(y, m + 1, 0)).getUTCDate()`. `formatPrice`: read the digits from `new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions().maximumFractionDigits` and format `minor / 10 ** digits` with the same formatter.',
      ],
    },
    {
      id: 'js-regex',
      title: 'Regex you can maintain (and that cannot DoS you)',
      kind: 'js',
      xp: 95,
      why: 'One nested quantifier in a validator took Cloudflare and Stack Overflow offline. A regex is code: it needs names, anchors, tests and a worst case.',
      tags: ['regex', 'ReDoS', 'unicode', 'parsing'],
      testTimeoutMs: 8000,
      hints: [
        'Build the log pattern piece by piece with named groups — `(?<ip>\\S+) - (?<user>\\S+) \\[(?<time>[^\\]]+)\\] "(?<method>[A-Z]+) (?<path>\\S+) (?<protocol>HTTP\\/[\\d.]+)" (?<status>\\d{3}) (?<bytes>\\d+|-) "(?<referrer>[^"]*)" "(?<userAgent>[^"]*)"` — anchor it with `^…$`, then read `match.groups`. Do not use the `g` flag on a regex you `.exec()` repeatedly: it keeps `lastIndex` between calls.',
        'The timestamp is `10/Oct/2025:13:55:36 +0200`: split it with a second small regex, look the month up in `["Jan", …, "Dec"]`, build `Date.UTC(...)` and subtract the offset (`sign * (hh * 60 + mm)` minutes).',
        'The slug pattern hangs because `([a-z0-9]+-?)+` can split "aaaa" into groups in exponentially many ways, and on a failing input the engine tries all of them. Rewrite it so every character can be matched in only one way: a run of `[a-z0-9]+`, then zero or more `-` followed by another run.',
        'Emoji: `\\p{Emoji}` is a code-point property and includes the digits 0-9, `#` and `*`. With the `v` flag, `\\p{RGI_Emoji}` matches whole emoji *sequences* (skin tones, ZWJ families, flags, keycaps) as one match: `text.match(/\\p{RGI_Emoji}/gv)`.',
        '`highlight`: `new RegExp(RegExp.escape(term), "gi")`, replaced with `"<mark>$&</mark>"` so the original casing survives. Return the text untouched when `term` is empty.',
      ],
    },
  ],
});
