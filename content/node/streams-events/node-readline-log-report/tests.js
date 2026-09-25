import { Readable } from 'node:stream';

const within = (promise, ms, message) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
};

const from = (chunks) => Readable.from(chunks.map((c) => Buffer.from(c)));
const line = (path, status, ms, method = 'GET') => `2024-05-01T10:00:00Z ${method} ${path} ${status} ${ms}ms`;

describe('summarizeLog', () => {
  it('summarises a small log', async () => {
    const text = [
      line('/api/users?page=2', 200, 35),
      line('/api/users', 200, 20),
      line('/api/orders', 404, 5),
      line('/login', 302, 12, 'POST'),
      line('/api/orders/7', 503, 900),
    ].join('\n') + '\n';
    expect(await solution.summarizeLog(from([text]))).toEqual({
      requests: 5,
      malformed: 0,
      statuses: { '2xx': 2, '3xx': 1, '4xx': 1, '5xx': 1 },
      p95Ms: 900,
      topPaths: [
        { path: '/api/users', count: 2 },
        { path: '/api/orders', count: 1 },
        { path: '/api/orders/7', count: 1 },
      ],
    });
  });

  it('counts malformed lines, ignores empty ones, and accepts \\r\\n', async () => {
    const text = [
      line('/a', 200, 10),
      '',
      'garbage',
      line('/a', 200, 10) + ' extra',
      line('/a', 'OK', 10),
      line('/a', 200, 'x'),
      line('/a', 200, 10).replace('10ms', '10'),
      line('/a', 200, 10).replace(' 200 ', ' 99 '),
      line('/a', 200, 10).replace(' 200 ', ' 600 '),
      line('/a', 200, 10).replace('GET /a', 'GET  /a'),
      line('/b', 201, 11),
      '',
    ].join('\r\n');
    const r = await solution.summarizeLog(from([text]));
    expect(r.requests).toBe(2);
    expect(r.malformed).toBe(8);
    expect(r.statuses['2xx']).toBe(2);
  });

  it('joins lines split across chunks, including a split \\r\\n', async () => {
    const chunks = ['2024-05-01T10:00:00Z GET /x 2', '00 15ms\r', '\n2024-05-01T10:00:01Z GET /y 500 2', '5ms\r\n'];
    const r = await solution.summarizeLog(from(chunks));
    expect(r).toMatchObject({ requests: 2, malformed: 0, statuses: { '2xx': 1, '3xx': 0, '4xx': 0, '5xx': 1 } });
  });

  it('computes p95 with the nearest-rank method', async () => {
    // 1..40 ms shuffled: ceil(0.95 * 40) = 38th smallest = 38
    const ms = Array.from({ length: 40 }, (_, i) => ((i * 17) % 40) + 1);
    const text = ms.map((m) => line('/p', 200, m)).join('\n');
    expect((await solution.summarizeLog(from([text]))).p95Ms).toBe(38);
    // 21 values: ceil(19.95) = 20th smallest
    const ms2 = Array.from({ length: 21 }, (_, i) => (i + 1) * 100);
    expect((await solution.summarizeLog(from([ms2.reverse().map((m) => line('/p', 200, m)).join('\n')]))).p95Ms).toBe(2000);
  });

  it('sorts numerically, not as strings', async () => {
    const text = [9, 100, 80, 1000, 7].map((m) => line('/n', 200, m)).join('\n');
    expect((await solution.summarizeLog(from([text]))).p95Ms).toBe(1000);
  });

  it('ranks top paths by count, then by path, keeping three', async () => {
    const paths = ['/d', '/c', '/c', '/b', '/b', '/a', '/a', '/e?x=1', '/e', '/e?y=2'];
    const text = paths.map((p) => line(p, 200, 1)).join('\n');
    expect((await solution.summarizeLog(from([text]))).topPaths).toEqual([
      { path: '/e', count: 3 },
      { path: '/a', count: 2 },
      { path: '/b', count: 2 },
    ]);
  });

  it('handles an empty log', async () => {
    expect(await solution.summarizeLog(from([]))).toEqual({
      requests: 0, malformed: 0, statuses: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, p95Ms: null, topPaths: [],
    });
  });

  it('rejects when the input stream fails half-way', async () => {
    const input = new Readable({ read() {} });
    input.push(line('/a', 200, 1) + '\n');
    const result = solution.summarizeLog(input);
    setImmediate(() => input.destroy(new Error('EIO: i/o error, read')));
    let caught;
    try {
      await within(result, 3000, 'HUNG: summarizeLog never settled after the input failed');
    } catch (e) {
      caught = e;
    }
    expect(caught && caught.message).toBe('EIO: i/o error, read');
  });

  it('streams a large log line by line', async () => {
    let i = 0;
    const input = new Readable({
      read() {
        if (i >= 50000) return this.push(null);
        const batch = [];
        for (let k = 0; k < 500; k++, i++) batch.push(line(`/r${i % 7}`, i % 10 === 0 ? 500 : 200, i % 100) + '\n');
        this.push(batch.join(''));
      },
    });
    const r = await solution.summarizeLog(input);
    expect(r.requests).toBe(50000);
    expect(r.statuses['5xx']).toBe(5000);
    expect(r.p95Ms).toBe(94);
  });
});
