import http from 'node:http';

const SORTS = ['createdAt', 'name', 'score'];
const isInteger = (raw) => /^-?\d+$/.test(raw);

export function parsePagination(searchParams) {
  const fields = {};
  const result = { limit: 20, offset: 0, sort: 'createdAt', direction: 'desc' };

  const rawLimit = searchParams.get('limit');
  if (rawLimit !== null) {
    if (!isInteger(rawLimit)) {
      fields.limit = 'must be an integer';
    } else {
      const value = Number(rawLimit);
      if (value < 1) fields.limit = 'must be at least 1';
      else if (value > 100) fields.limit = 'must be at most 100';
      else result.limit = value;
    }
  }

  const rawOffset = searchParams.get('offset');
  if (rawOffset !== null) {
    if (!isInteger(rawOffset)) fields.offset = 'must be an integer';
    else if (Number(rawOffset) < 0) fields.offset = 'must be at least 0';
    else result.offset = Number(rawOffset);
  }

  const rawSort = searchParams.get('sort');
  if (rawSort !== null) {
    if (!SORTS.includes(rawSort)) fields.sort = 'must be one of ' + SORTS.join(', ');
    else result.sort = rawSort;
  }

  const rawDirection = searchParams.get('direction');
  if (rawDirection !== null) {
    const normalised = rawDirection.toLowerCase();
    if (normalised !== 'asc' && normalised !== 'desc') fields.direction = 'must be asc or desc';
    else result.direction = normalised;
  }

  if (Object.keys(fields).length > 0) {
    const error = new Error('invalid query');
    error.status = 400;
    error.fields = fields;
    throw error;
  }
  return result;
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname !== '/items') return send(404, { error: 'not found' });
    try {
      send(200, parsePagination(url.searchParams));
    } catch (error) {
      send(error.status ?? 500, { error: error.message, fields: error.fields });
    }
  });
}
