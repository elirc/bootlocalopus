import http from 'node:http';

export function readBudget(headers, { defaultMs = 10_000, maxMs = 30_000 } = {}) {
  // Trusts the client and accepts anything Number() does.
  return Number(headers['x-request-timeout-ms']) || defaultMs;
}

export function createDeadline(budgetMs, { now = Date.now } = {}) {
  throw new Error('not implemented');
}

export function createServer({ lookupPrice, now = Date.now, defaultMs = 10_000, maxMs = 30_000, marginMs = 20, minBudgetMs = 50 }) {
  return http.createServer((req, res) => {
    // TODO: read the budget, refuse tiny ones, forward what is left, 504 when it runs out.
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  });
}
