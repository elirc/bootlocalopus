import http from 'node:http';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 1234 -> "12.34", 5 -> "0.05", -250 -> "-2.50". */
function money(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100)}`;
}

/** RFC 4180 quoting, plus a guard against spreadsheet formula injection. */
function cell(value) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const line = (cells) => cells.join(',') + '\r\n';

/** `orders`: [{ id, customer, totalCents, placedAt: ISO string }]. */
export function createApp({ orders }) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' || url.pathname !== '/reports/orders.csv') {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 'NOT_FOUND' } }));
    }

    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!DATE.test(from ?? '') || !DATE.test(to ?? '') || from > to) {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 'BAD_RANGE' } }));
    }

    // Both ends inclusive: compare the calendar date of placedAt.
    const rows = orders
      .filter((o) => o.placedAt.slice(0, 10) >= from && o.placedAt.slice(0, 10) <= to)
      .sort((a, b) => (a.placedAt < b.placedAt ? -1 : a.placedAt > b.placedAt ? 1 : String(a.id) < String(b.id) ? -1 : 1));

    res.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="orders-${from}-to-${to}.csv"`,
    });
    res.write(line(['id', 'customer', 'total', 'placedAt']));
    for (const o of rows) res.write(line([cell(o.id), cell(o.customer), money(o.totalCents), cell(o.placedAt)]));
    res.end();
  });
}
