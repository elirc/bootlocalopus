import { createHmac } from 'node:crypto';

const SECRET = 'whsec_test';
const NOW_MS = 1_700_000_000_000;       // the fake clock's time
const NOW_S = NOW_MS / 1000;            // the same moment in unix seconds

/** The X-Signature header for `raw`, signed at unix time `t` (seconds). */
function sign(raw, t = NOW_S, secret = SECRET) {
  const v1 = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

/**
 * Starts the app with a recording onEvent and a fixed clock, and always closes the server.
 *   await withApp({}, async ({ post, events }) => { const { status } = await post(raw, sign(raw)); });
 * Pass `{ onEvent }` to replace the handler (it still records into `events`).
 */
async function withApp({ onEvent = () => {}, now = () => NOW_MS } = {}, fn) {
  const events = [];
  const server = solution.createApp({
    secret: SECRET,
    now,
    onEvent: async (event) => { events.push(event); return onEvent(event); },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${server.address().port}/webhooks`;
  const post = async (raw, signature) => {
    const headers = { 'content-type': 'application/json' };
    if (signature !== undefined) headers['x-signature'] = signature;
    const res = await fetch(url, { method: 'POST', headers, body: raw });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  try {
    return await fn({ post, events });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('webhooks', () => {
  it('accepts a signed event', async () => {
    await withApp({}, async ({ post, events }) => {
      const raw = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded' });
      const { status } = await post(raw, sign(raw));
      expect(status).toBe(200);
    });
  });

  // TODO: bad signatures, a pretty-printed body, stale and future timestamps,
  // a replayed signature with a new t, duplicates, and a handler that throws.
});
