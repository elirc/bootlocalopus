const { createJsonHandler, ClientError } = solution;

// A small hand-written parser for { sku: string, qty: positive integer }.
function parseLine(body) {
  const issues = [];
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, issues: [{ path: '', message: 'expected an object' }] };
  if (typeof body.sku !== 'string' || body.sku === '') issues.push({ path: 'sku', message: 'required' });
  if (!Number.isInteger(body.qty) || body.qty < 1) issues.push({ path: 'qty', message: 'must be a positive integer' });
  return issues.length ? { ok: false, issues } : { ok: true, value: { sku: body.sku, qty: body.qty } };
}

function setup(overrides = {}) {
  const logs = [];
  const calls = [];
  let n = 0;
  const handler = createJsonHandler({
    method: 'POST',
    parse: parseLine,
    handle: async (input, ctx) => { calls.push({ input, ctx }); return { added: input.sku, qty: input.qty }; },
    log: (entry) => logs.push(entry),
    requestId: () => `req_${++n}`,
    ...overrides,
  });
  return { handler, logs, calls };
}

const req = (body, extra = {}) => ({
  method: 'POST',
  path: '/cart/lines',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
  ...extra,
});

const bodyOf = (res) => JSON.parse(res.body);

describe('the happy path', () => {
  it('parses, validates, calls the handler with the parsed value and a request id, and answers JSON', async () => {
    const { handler, calls, logs } = setup();
    const res = await handler(req({ sku: 'MUG-1', qty: 2, ignored: true }));
    expect(res.status).toBe(200);
    expect(res.headers).toEqual({ 'content-type': 'application/json; charset=utf-8', 'x-request-id': 'req_1' });
    expect(bodyOf(res)).toEqual({ added: 'MUG-1', qty: 2 });
    expect(calls).toEqual([{ input: { sku: 'MUG-1', qty: 2 }, ctx: { requestId: 'req_1' } }]);
    expect(logs).toEqual([{ level: 'info', requestId: 'req_1', method: 'POST', path: '/cart/lines', status: 200 }]);
  });
  it('uses successStatus, and accepts a content-type with parameters in any case', async () => {
    const { handler } = setup({ successStatus: 201 });
    const res = await handler(req({ sku: 'A', qty: 1 }, { headers: { 'content-type': 'Application/JSON; charset=UTF-8' } }));
    expect(res.status).toBe(201);
  });
  it('accepts a lowercase method', async () => {
    const { handler } = setup();
    expect((await handler(req({ sku: 'A', qty: 1 }, { method: 'post' }))).status).toBe(200);
  });
  it('answers 204 with an empty body when the handler returns nothing', async () => {
    const { handler } = setup({ handle: async () => undefined });
    const res = await handler(req({ sku: 'A', qty: 1 }));
    expect(res).toEqual({ status: 204, headers: { 'x-request-id': 'req_1' }, body: '' });
  });
  it('accepts a synchronous handler', async () => {
    const { handler } = setup({ handle: (input) => ({ sync: input.qty }) });
    expect(bodyOf(await handler(req({ sku: 'A', qty: 3 })))).toEqual({ sync: 3 });
  });
});

describe('rejections before the handler', () => {
  it('405 with an allow header for the wrong method', async () => {
    const { handler, calls, logs } = setup();
    const res = await handler(req({ sku: 'A', qty: 1 }, { method: 'GET' }));
    expect(res.status).toBe(405);
    expect(res.headers).toEqual({ 'content-type': 'application/problem+json', allow: 'POST', 'x-request-id': 'req_1' });
    expect(bodyOf(res)).toEqual({ type: 'about:blank', title: 'Method Not Allowed', status: 405, requestId: 'req_1' });
    expect(calls).toHaveLength(0);
    expect(logs[0].level).toBe('warn');
  });
  it('415 for a missing or non-JSON content type, even when the body is JSON', async () => {
    const { handler } = setup();
    const noType = await handler(req({ sku: 'A', qty: 1 }, { headers: {} }));
    expect(noType.status).toBe(415);
    expect(bodyOf(noType).title).toBe('Unsupported Media Type');
    expect((await handler(req({ sku: 'A', qty: 1 }, { headers: { 'content-type': 'text/plain' } }))).status).toBe(415);
    expect((await handler(req({ sku: 'A', qty: 1 }, { headers: { 'content-type': 'application/jsonp' } }))).status).toBe(415);
  });
  it('413 when the body is over the limit in BYTES', async () => {
    const { handler, calls } = setup({ maxBodyBytes: 40 });
    const ascii = JSON.stringify({ sku: 'x'.repeat(20), qty: 1 }); // 38 bytes
    expect((await handler(req(ascii))).status).toBe(200);
    const accented = JSON.stringify({ sku: 'é'.repeat(20), qty: 1 }); // 38 characters, 58 bytes
    const res = await handler(req(accented));
    expect(res.status).toBe(413);
    expect(bodyOf(res).title).toBe('Payload Too Large');
    expect(calls).toHaveLength(1);
  });
  it('defaults the limit to 10000 bytes', async () => {
    const { handler } = setup();
    const big = JSON.stringify({ sku: 'x'.repeat(10_000), qty: 1 });
    expect((await handler(req(big))).status).toBe(413);
  });
  it('400 for malformed JSON', async () => {
    const { handler } = setup();
    const res = await handler(req('{"sku": "A",'));
    expect(res.status).toBe(400);
    expect(bodyOf(res)).toEqual({ type: 'about:blank', title: 'Malformed JSON', status: 400, requestId: 'req_1' });
  });
  it('422 with every issue from the parser', async () => {
    const { handler, calls, logs } = setup();
    const res = await handler(req({ qty: 0 }));
    expect(res.status).toBe(422);
    expect(bodyOf(res)).toEqual({
      type: 'about:blank', title: 'Validation Failed', status: 422, requestId: 'req_1',
      errors: [{ path: 'sku', message: 'required' }, { path: 'qty', message: 'must be a positive integer' }],
    });
    expect(calls).toHaveLength(0);
    expect(logs[0]).toEqual({ level: 'warn', requestId: 'req_1', method: 'POST', path: '/cart/lines', status: 422 });
  });
  it('checks in order: method, then media type, then size, then JSON', async () => {
    const { handler } = setup({ maxBodyBytes: 5 });
    expect((await handler({ method: 'PUT', path: '/', headers: {}, body: '{{{{{{{{' })).status).toBe(405);
    expect((await handler({ method: 'POST', path: '/', headers: {}, body: '{{{{{{{{' })).status).toBe(415);
    expect((await handler({ method: 'POST', path: '/', headers: { 'content-type': 'application/json' }, body: '{{{{{{{{' })).status).toBe(413);
    expect((await handler({ method: 'POST', path: '/', headers: { 'content-type': 'application/json' }, body: '{{' })).status).toBe(400);
  });
});

describe('failures inside the handler', () => {
  it('sends a ClientError with its status and message', async () => {
    const { handler, logs } = setup({ handle: async () => { throw new ClientError(409, 'MUG-1 is already in the cart'); } });
    const res = await handler(req({ sku: 'MUG-1', qty: 1 }));
    expect(res.status).toBe(409);
    expect(bodyOf(res)).toEqual({ type: 'about:blank', title: 'Request Failed', status: 409, detail: 'MUG-1 is already in the cart', requestId: 'req_1' });
    expect(logs[0].level).toBe('warn');
    expect(Object.hasOwn(logs[0], 'error')).toBe(false);
  });
  it('turns anything else into a bare 500, and puts the real message only in the log', async () => {
    const secret = 'duplicate key value violates unique constraint "carts_pkey" password=hunter2';
    const { handler, logs } = setup({ handle: async () => { throw new Error(secret); } });
    const res = await handler(req({ sku: 'A', qty: 1 }));
    expect(res.status).toBe(500);
    expect(res.body.includes('hunter2')).toBe(false);
    expect(bodyOf(res)).toEqual({ type: 'about:blank', title: 'Internal Server Error', status: 500, requestId: 'req_1' });
    expect(logs).toEqual([{ level: 'error', requestId: 'req_1', method: 'POST', path: '/cart/lines', status: 500, error: secret }]);
  });
  it('catches a synchronous throw and a thrown non-Error', async () => {
    const { handler, logs } = setup({ handle: () => { throw 'plain string'; } });
    const res = await handler(req({ sku: 'A', qty: 1 }));
    expect(res.status).toBe(500);
    expect(logs[0].error).toBe('plain string');
  });
  it('treats a parser that throws as a 500, not a crash', async () => {
    const { handler } = setup({ parse: () => { throw new TypeError('bug in parser'); } });
    expect((await handler(req({ sku: 'A', qty: 1 }))).status).toBe(500);
  });
  it('treats a result that cannot be serialised as a 500', async () => {
    const { handler, logs } = setup({ handle: async () => ({ total: 10n }) });
    const res = await handler(req({ sku: 'A', qty: 1 }));
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toBe('application/problem+json');
    expect(logs[0].level).toBe('error');
    expect(logs[0].error).toMatch(/BigInt/);
  });
});

describe('request ids', () => {
  it('uses a fresh id per request, in the header, the body and the log', async () => {
    const { handler, logs } = setup();
    const a = await handler(req({ sku: 'A', qty: 1 }));
    const b = await handler(req('nope'));
    expect(a.headers['x-request-id']).toBe('req_1');
    expect(b.headers['x-request-id']).toBe('req_2');
    expect(bodyOf(b).requestId).toBe('req_2');
    expect(logs.map((l) => l.requestId)).toEqual(['req_1', 'req_2']);
    expect(logs).toHaveLength(2);
  });
});
