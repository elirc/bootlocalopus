async function withApp(orders, fn) {
  const server = solution.createApp({ orders });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const get = async (path) => {
    const res = await fetch(base + path);
    return { status: res.status, headers: res.headers, text: await res.text() };
  };
  try {
    return await fn(get);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const order = (id, customer, totalCents, placedAt) => ({ id, customer, totalCents, placedAt });
const JANUARY = '/reports/orders.csv?from=2024-01-01&to=2024-01-31';

/** A small RFC 4180 reader: rows of fields, honouring quotes, doubled quotes and CRLF. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
    else field += c;
  }
  if (field !== '' || row.length) rows.push([...row, field]);
  return rows;
}

describe('the download', () => {
  it('is a text/csv attachment named after the range', async () => {
    await withApp([], async (get) => {
      const { status, headers } = await get(JANUARY);
      expect(status).toBe(200);
      expect(headers.get('content-type').split(';')[0].trim().toLowerCase()).toBe('text/csv');
      const disposition = headers.get('content-disposition');
      expect(disposition).toMatch(/^attachment\s*;/i);
      expect(disposition).toMatch(/filename="?orders-2024-01-01-to-2024-01-31\.csv"?/);
    });
  });

  it('ends every line, including the last, with CRLF', async () => {
    await withApp([order('o1', 'Alice', 1000, '2024-01-10T09:00:00Z')], async (get) => {
      const { text } = await get(JANUARY);
      expect(text).toBe('id,customer,total,placedAt\r\no1,Alice,10.00,2024-01-10T09:00:00Z\r\n');
    });
  });
});

describe('the range', () => {
  it('includes both ends of the range, by date, in placedAt order', async () => {
    const orders = [
      order('late', 'C', 100, '2024-01-31T23:59:00Z'),
      order('before', 'X', 100, '2023-12-31T23:59:59Z'),
      order('first', 'A', 100, '2024-01-01T00:00:00Z'),
      order('after', 'Y', 100, '2024-02-01T00:00:00Z'),
      order('mid', 'B', 100, '2024-01-15T12:00:00Z'),
    ];
    await withApp(orders, async (get) => {
      const rows = parseCsv((await get(JANUARY)).text);
      expect(rows.slice(1).map((r) => r[0])).toEqual(['first', 'mid', 'late']);
    });
  });

  it('answers 400 BAD_RANGE for a missing, malformed or inverted range', async () => {
    await withApp([], async (get) => {
      for (const query of ['', '?from=2024-01-01', '?from=2024-1-1&to=2024-01-31', '?from=2024-02-01&to=2024-01-01']) {
        const res = await get('/reports/orders.csv' + query);
        expect(res.status).toBe(400);
        expect(JSON.parse(res.text).error.code).toBe('BAD_RANGE');
      }
    });
  });
});

describe('the cells', () => {
  it('formats totals with two decimals, including small amounts and refunds', async () => {
    const orders = [
      order('a', 'A', 1234, '2024-01-02T00:00:00Z'),
      order('b', 'B', 5, '2024-01-03T00:00:00Z'),
      order('c', 'C', 1205, '2024-01-04T00:00:00Z'),
      order('d', 'D', -250, '2024-01-05T00:00:00Z'),
    ];
    await withApp(orders, async (get) => {
      const rows = parseCsv((await get(JANUARY)).text);
      expect(rows.slice(1).map((r) => r[2])).toEqual(['12.34', '0.05', '12.05', '-2.50']);
    });
  });

  it('quotes commas, quotes and newlines so every row keeps four columns', async () => {
    const orders = [
      order('a', 'Smith, Jones & Co', 100, '2024-01-02T00:00:00Z'),
      order('b', 'The "Best" Shop', 100, '2024-01-03T00:00:00Z'),
      order('c', 'Line one\nLine two', 100, '2024-01-04T00:00:00Z'),
    ];
    await withApp(orders, async (get) => {
      const { text } = await get(JANUARY);
      expect(text).toContain('a,"Smith, Jones & Co",1.00,');
      expect(text).toContain('b,"The ""Best"" Shop",1.00,');
      const rows = parseCsv(text);
      expect(rows.every((r) => r.length === 4)).toBe(true);
      expect(rows.slice(1).map((r) => r[1])).toEqual(['Smith, Jones & Co', 'The "Best" Shop', 'Line one\nLine two']);
    });
  });

  it('defuses cells that a spreadsheet would run as a formula', async () => {
    const orders = [
      order('a', '=HYPERLINK("http://evil.example","x")', 100, '2024-01-02T00:00:00Z'),
      order('b', '@SUM(1)', 100, '2024-01-03T00:00:00Z'),
      order('c', 'Plain name', 100, '2024-01-04T00:00:00Z'),
    ];
    await withApp(orders, async (get) => {
      const rows = parseCsv((await get(JANUARY)).text);
      expect(rows.slice(1).map((r) => r[1])).toEqual([
        '\'=HYPERLINK("http://evil.example","x")',
        '\'@SUM(1)',
        'Plain name',
      ]);
    });
  });
});
