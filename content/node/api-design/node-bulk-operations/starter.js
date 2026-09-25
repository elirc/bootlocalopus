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

export function createBulkHandler({ validate, create, keyOf, maxItems = 100, concurrency = 4 }) {
  return async (req, res) => {
    // TODO: per-item results in index order, duplicates within the batch,
    // bounded concurrency, 201 vs 207, and a summary.
    // This version stops at the first bad item — after creating the ones before it.
    let items = [];
    try { items = JSON.parse(await readBody(req)).items ?? []; } catch {}
    const created = [];
    for (const item of items) {
      const problem = validate(item);
      if (problem) return send(res, 400, { error: { code: 'VALIDATION_FAILED', message: problem } });
      try {
        created.push(await create(item));
      } catch (error) {
        return send(res, 500, { error: { code: 'INTERNAL', message: String(error) } });
      }
    }
    send(res, 201, { results: created });
  };
}
