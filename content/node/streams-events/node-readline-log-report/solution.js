import readline from 'node:readline';

const STATUS = /^[1-5]\d\d$/;
const DURATION = /^(\d+)ms$/;

export async function summarizeLog(input) {
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const statuses = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  const perPath = new Map();
  const durations = [];
  let malformed = 0;

  // The async iterator rejects if `input` errors, so a failed read cannot
  // turn into a report on half the file. (An on('line')/on('close') version
  // has no such guarantee.)
  for await (const line of lines) {
    if (line === '') continue;
    const parts = line.split(' ');
    const duration = parts.length === 5 ? DURATION.exec(parts[4]) : null;
    if (!duration || !STATUS.test(parts[3])) {
      malformed++;
      continue;
    }
    const [, , rawPath, status] = parts;
    const path = rawPath.split('?')[0];
    durations.push(Number(duration[1]));
    perPath.set(path, (perPath.get(path) ?? 0) + 1);
    const statusClass = `${status[0]}xx`;
    if (statusClass in statuses) statuses[statusClass]++;
  }

  durations.sort((a, b) => a - b);
  const p95Ms = durations.length ? durations[Math.ceil(0.95 * durations.length) - 1] : null;
  const topPaths = [...perPath]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, 3);

  return { requests: durations.length, malformed, statuses, p95Ms, topPaths };
}
