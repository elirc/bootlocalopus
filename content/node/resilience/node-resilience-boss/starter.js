import http from 'node:http';

export function createGateway({
  upstream,
  defaultMs = 2000,
  maxMs = 5000,
  marginMs = 20,
  minBudgetMs = 50,
  maxConcurrent = 4,
  maxAttempts = 3,
  baseMs = 50,
  retryRatio = 0.1,
  minRetries = 3,
  retryWindowMs = 10_000,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  random = Math.random,
}) {
  // TODO: deadline, bulkhead, retries within a budget, stale fallback.
  const server = http.createServer((req, res) => {
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not implemented' }));
  });
  return { server };
}
