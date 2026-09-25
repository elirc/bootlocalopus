function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const itemError = (index, status, code, message) => ({ index, status, error: { code, message } });

/** Runs `worker` over `jobs` with at most `limit` in flight, starting them in order. */
async function forEachLimited(jobs, limit, worker) {
  let next = 0;
  const lane = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      await worker(job);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, lane));
}

export function createBulkHandler({ validate, create, keyOf, maxItems = 100, concurrency = 4 }) {
  return async (req, res) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      body = undefined;
    }
    const items = body !== null && typeof body === 'object' ? body.items : undefined;
    if (!Array.isArray(items) || items.length === 0) {
      return send(res, 400, { error: { code: 'INVALID_BODY', message: 'send { "items": [ ... ] } with at least one item' } });
    }
    if (items.length > maxItems) {
      return send(res, 400, { error: { code: 'BATCH_TOO_LARGE', message: `at most ${maxItems} items per request` } });
    }

    // Pass 1, synchronous: decide which items are creatable.
    const results = new Array(items.length);
    const toCreate = [];
    const seen = new Set();
    items.forEach((item, index) => {
      const problem = validate(item);
      if (problem) {
        results[index] = itemError(index, 422, 'VALIDATION_FAILED', problem);
        return;
      }
      const key = keyOf(item);
      if (seen.has(key)) {
        results[index] = itemError(index, 409, 'DUPLICATE_IN_BATCH', 'an earlier item in this batch has the same key');
        return;
      }
      seen.add(key);
      toCreate.push(index);
    });

    // Pass 2: create with bounded concurrency. Results land in their own slot,
    // so completion order does not matter.
    await forEachLimited(toCreate, concurrency, async (index) => {
      try {
        results[index] = { index, status: 201, data: await create(items[index]) };
      } catch {
        // The real error belongs in your logs, not in the response.
        results[index] = itemError(index, 500, 'INTERNAL', 'internal error');
      }
    });

    const succeeded = results.filter((r) => r.status === 201).length;
    send(res, succeeded === results.length ? 201 : 207, {
      results,
      summary: { total: results.length, succeeded, failed: results.length - succeeded },
    });
  };
}
