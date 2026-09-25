/** Parses an Accept header into [{ type, subtype, q }], dropping ranges with a bad q. */
function parseAccept(header) {
  const ranges = [];
  for (const part of header.split(',')) {
    const [range, ...params] = part.split(';').map((s) => s.trim());
    const [type, subtype] = range.toLowerCase().split('/');
    if (!type || !subtype) continue;
    let q = 1;
    let valid = true;
    for (const param of params) {
      const [key, value = ''] = param.split('=').map((s) => s.trim());
      if (key.toLowerCase() !== 'q') continue;
      q = value === '' ? NaN : Number(value);
      if (!(q >= 0 && q <= 1)) valid = false;
    }
    if (valid) ranges.push({ type, subtype, q });
  }
  return ranges;
}

/** 3 = exact, 2 = type/*, 1 = * / *, 0 = no match. */
function specificity(range, type, subtype) {
  if (range.type === type && range.subtype === subtype) return 3;
  if (range.type === type && range.subtype === '*') return 2;
  if (range.type === '*' && range.subtype === '*') return 1;
  return 0;
}

export function negotiate(accept, available) {
  if (accept === undefined || accept.trim() === '') return available[0] ?? null;
  const ranges = parseAccept(accept);
  let best = null;
  let bestQ = 0;
  for (const candidate of available) {
    const [type, subtype] = candidate.toLowerCase().split('/');
    let q = 0;
    let level = 0;
    for (const range of ranges) {
      const s = specificity(range, type, subtype);
      if (s > level) {
        level = s;
        q = range.q;
      }
    }
    if (q > bestQ) {
      // strictly greater: on a tie the earlier (preferred) type wins
      best = candidate;
      bestQ = q;
    }
  }
  return best;
}

const AVAILABLE = ['application/json', 'text/csv'];

const send = (res, status, type, body, headers = {}) => {
  res.writeHead(status, { 'content-type': type, ...headers });
  res.end(body);
};

export function createReportHandler(getRows) {
  return (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' || pathname !== '/report') {
      send(res, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'not found' }));
      return;
    }
    const vary = { vary: 'Accept' };
    const chosen = negotiate(req.headers.accept, AVAILABLE);
    if (chosen === null) {
      send(res, 406, 'application/json; charset=utf-8', JSON.stringify({ error: 'not acceptable', available: AVAILABLE }), vary);
      return;
    }
    const rows = getRows();
    if (chosen === 'text/csv') {
      const csv = 'id,name\n' + rows.map((r) => `${r.id},${r.name}\n`).join('');
      send(res, 200, 'text/csv; charset=utf-8', csv, vary);
    } else {
      send(res, 200, 'application/json; charset=utf-8', JSON.stringify(rows), vary);
    }
  };
}
