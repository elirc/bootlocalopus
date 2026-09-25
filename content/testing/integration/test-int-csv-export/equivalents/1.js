// Same bytes, built differently: one joined string, toFixed for money, other header spellings.
import http from 'node:http';

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

const RISKY_START = new Set(['=', '+', '-', '@']);

function escapeCell(raw) {
  const s = RISKY_START.has(String(raw)[0]) ? "'" + raw : String(raw);
  const needsQuotes = s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r');
  return needsQuotes ? '"' + s.split('"').join('""') + '"' : s;
}

export function createApp({ orders }) {
  return http.createServer((req, res) => {
    const { pathname, searchParams } = new URL(req.url, 'http://h');
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    if (pathname !== '/reports/orders.csv' || req.method !== 'GET') return json(404, { error: { code: 'NOT_FOUND', message: 'no' } });

    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (!isDate(from) || !isDate(to) || to < from) return json(400, { error: { code: 'BAD_RANGE', message: 'from and to must be YYYY-MM-DD, from <= to' } });

    const day = (o) => o.placedAt.substring(0, 10);
    const selected = orders.filter((o) => day(o) >= from && day(o) <= to);
    selected.sort((a, b) => ((a.placedAt > b.placedAt) - (a.placedAt < b.placedAt)) || (String(a.id) < String(b.id) ? -1 : 1));

    const lines = [['id', 'customer', 'total', 'placedAt'].join(',')];
    for (const o of selected) {
      lines.push([escapeCell(o.id), escapeCell(o.customer), (o.totalCents / 100).toFixed(2), escapeCell(o.placedAt)].join(','));
    }
    res.writeHead(200, {
      'Content-Disposition': `attachment; filename=orders-${from}-to-${to}.csv`,
      'Content-Type': 'text/csv;charset=UTF-8',
    });
    res.end(lines.map((l) => l + '\r\n').join(''));
  });
}
