import { createHmac } from 'node:crypto';

const SECRET = 'whsec_test';
const NOW_MS = 1_700_000_000_000;
const NOW_S = NOW_MS / 1000;

function sign(raw, t = NOW_S, secret = SECRET) {
  const v1 = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

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

const EVENT = { id: 'evt_1', type: 'payment.succeeded', amount: 1200 };
const compact = JSON.stringify(EVENT);

describe('signatures', () => {
  it('accepts a correctly signed event and hands it to onEvent', async () => {
    await withApp({}, async ({ post, events }) => {
      const res = await post(compact, sign(compact));
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(events).toEqual([EVENT]);
    });
  });

  it('verifies the raw body: a pretty-printed payload signed as sent is accepted', async () => {
    await withApp({}, async ({ post, events }) => {
      const pretty = JSON.stringify(EVENT, null, 2);
      const res = await post(pretty, sign(pretty));
      expect(res.status).toBe(200);
      expect(events).toEqual([EVENT]);
    });
  });

  it('rejects a missing, malformed, wrong-secret or tampered signature', async () => {
    await withApp({}, async ({ post, events }) => {
      const tampered = JSON.stringify({ ...EVENT, amount: 1 });
      for (const [raw, signature] of [
        [compact, undefined],
        [compact, 'nonsense'],
        [compact, sign(compact, NOW_S, 'whsec_wrong')],
        [tampered, sign(compact)],
      ]) {
        const res = await post(raw, signature);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_SIGNATURE');
      }
      expect(events).toEqual([]);
    });
  });

  it('rejects an old signature sent with a fresh timestamp', async () => {
    await withApp({}, async ({ post, events }) => {
      const old = sign(compact, NOW_S - 3600);
      const v1 = old.split('v1=')[1];
      const res = await post(compact, `t=${NOW_S},v1=${v1}`);
      expect(res.status).toBe(401);
      expect(events).toEqual([]);
    });
  });
});

describe('timestamps', () => {
  it('accepts up to 300 s either way', async () => {
    await withApp({}, async ({ post }) => {
      expect((await post(compact, sign(compact, NOW_S - 300))).status).toBe(200);
      const other = JSON.stringify({ ...EVENT, id: 'evt_2' });
      expect((await post(other, sign(other, NOW_S + 300))).status).toBe(200);
    });
  });

  it('rejects a timestamp too far in the past or the future as STALE_SIGNATURE', async () => {
    await withApp({}, async ({ post, events }) => {
      for (const t of [NOW_S - 301, NOW_S + 301, NOW_S - 86_400]) {
        const res = await post(compact, sign(compact, t));
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('STALE_SIGNATURE');
      }
      expect(events).toEqual([]);
    });
  });
});

describe('delivery', () => {
  it('handles a duplicate delivery once, and still answers 200', async () => {
    await withApp({}, async ({ post, events }) => {
      expect((await post(compact, sign(compact))).status).toBe(200);
      expect((await post(compact, sign(compact))).status).toBe(200);
      expect(events).toHaveLength(1);
    });
  });

  it('answers 500 when the handler throws, and processes the retry', async () => {
    let failures = 1;
    const onEvent = () => {
      if (failures-- > 0) throw new Error('database is down');
    };
    await withApp({ onEvent }, async ({ post, events }) => {
      const first = await post(compact, sign(compact));
      expect(first.status).toBe(500);
      expect(first.body.error.code).toBe('HANDLER_FAILED');

      const retry = await post(compact, sign(compact));
      expect(retry.status).toBe(200);
      expect(events).toHaveLength(2);
    });
  });
});
