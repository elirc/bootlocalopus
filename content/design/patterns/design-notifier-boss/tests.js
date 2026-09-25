const { createNotifier } = solution;
const flush = () => new Promise((r) => setImmediate(r));
const at = (hour, minute = 0) => Date.UTC(2024, 0, 15, hour, minute);

/** A channel that records sends and succeeds, or fails with `failWith`. */
const channel = (id, { supports = () => true, failWith = null } = {}) => {
  const sent = [];
  return {
    id,
    sent,
    supports,
    async send(user, message) {
      if (failWith) throw failWith;
      sent.push({ to: user.id, key: message.key });
    },
  };
};

const user = { id: 'u1', email: 'ada@example.com', phone: '+447700900001' };
const msg = (o = {}) => ({ key: 'order-42-shipped', topic: 'orders', text: 'Your order shipped', ...o });

const setup = ({ prefs = {}, channels, dedupeWindowMs } = {}) => {
  const clock = { t: at(12) };
  const email = channel('email');
  const sms = channel('sms', { supports: (u) => Boolean(u.phone) });
  const push = channel('push');
  const list = channels ?? [email, sms, push];
  const events = [];
  const prefsFor = typeof prefs === 'function' ? prefs : async () => prefs;
  const notifier = createNotifier({
    channels: list,
    getPreferences: prefsFor,
    clock: () => clock.t,
    ...(dedupeWindowMs !== undefined ? { dedupeWindowMs } : {}),
  });
  for (const type of ['sent', 'failed', 'suppressed', 'undeliverable']) {
    notifier.on(type, (payload) => events.push({ type, ...payload }));
  }
  return { notifier, clock, email, sms, push, events };
};

describe('routing through channel strategies', () => {
  it('sends through the first preferred channel and reports it', async () => {
    const s = setup({ prefs: { channels: ['sms', 'email'] } });
    expect(await s.notifier.notify(user, msg())).toEqual({ status: 'sent', channel: 'sms' });
    expect(s.sms.sent).toEqual([{ to: 'u1', key: 'order-42-shipped' }]);
    expect(s.email.sent).toEqual([]);
    expect(s.events).toEqual([{ type: 'sent', userId: 'u1', key: 'order-42-shipped', channel: 'sms' }]);
  });

  it('uses the defaults when there are no preferences (email only)', async () => {
    const s = setup({ prefs: () => Promise.resolve(null) });
    expect(await s.notifier.notify(user, msg())).toEqual({ status: 'sent', channel: 'email' });
  });

  it('fills in missing preference fields from the defaults', async () => {
    const s = setup({ prefs: { mutedTopics: ['marketing'] } });
    expect(await s.notifier.notify(user, msg())).toEqual({ status: 'sent', channel: 'email' });
  });

  it('skips channels the user cannot receive, and channel ids nobody registered', async () => {
    const s = setup({ prefs: { channels: ['pigeon', 'sms', 'push'] } });
    const noPhone = { id: 'u2', email: 'bob@example.com' };
    expect(await s.notifier.notify(noPhone, msg())).toEqual({ status: 'sent', channel: 'push' });
    expect(s.sms.sent).toEqual([]);
  });

  it('works with a channel it has never heard of', async () => {
    const slack = channel('slack');
    const s = setup({ prefs: { channels: ['slack'] }, channels: [slack] });
    expect(await s.notifier.notify(user, msg())).toEqual({ status: 'sent', channel: 'slack' });
    expect(slack.sent).toHaveLength(1);
  });

  it('rejects two channels with the same id', () => {
    expect(() => createNotifier({ channels: [channel('email'), channel('email')], getPreferences: async () => null })).toThrow();
  });
});

describe('fallback when a channel fails', () => {
  it('falls through to the next channel and reports each failure', async () => {
    const down = new Error('SMS provider 503');
    const sms = channel('sms', { failWith: down });
    const email = channel('email');
    const s = setup({ prefs: { channels: ['sms', 'email'] }, channels: [sms, email] });
    expect(await s.notifier.notify(user, msg())).toEqual({ status: 'sent', channel: 'email' });
    expect(s.events).toEqual([
      { type: 'failed', userId: 'u1', key: 'order-42-shipped', channel: 'sms', error: down },
      { type: 'sent', userId: 'u1', key: 'order-42-shipped', channel: 'email' },
    ]);
  });

  it('treats a channel that throws synchronously like any other failure', async () => {
    const broken = { id: 'push', supports: () => true, send() { throw new Error('not async'); } };
    const email = channel('email');
    const s = setup({ prefs: { channels: ['push', 'email'] }, channels: [broken, email] });
    expect(await s.notifier.notify(user, msg())).toEqual({ status: 'sent', channel: 'email' });
  });

  it('reports undeliverable, with what it tried, when every channel fails', async () => {
    const a = channel('sms', { failWith: new Error('a') });
    const b = channel('email', { failWith: new Error('b') });
    const s = setup({ prefs: { channels: ['sms', 'pigeon', 'email'] }, channels: [a, b] });
    expect(await s.notifier.notify(user, msg())).toEqual({ status: 'undeliverable', attempted: ['sms', 'email'] });
    expect(s.events.map((e) => e.type)).toEqual(['failed', 'failed', 'undeliverable']);
    expect(s.events[2]).toEqual({ type: 'undeliverable', userId: 'u1', key: 'order-42-shipped', attempted: ['sms', 'email'] });
  });

  it('is undeliverable with nothing attempted when no channel fits', async () => {
    const s = setup({ prefs: { channels: ['sms'] } });
    expect(await s.notifier.notify({ id: 'u3' }, msg())).toEqual({ status: 'undeliverable', attempted: [] });
  });
});

describe('preferences', () => {
  it('suppresses muted topics', async () => {
    const s = setup({ prefs: { mutedTopics: ['orders'] } });
    expect(await s.notifier.notify(user, msg())).toEqual({ status: 'suppressed', reason: 'muted' });
    expect(s.email.sent).toEqual([]);
    expect(s.events).toEqual([{ type: 'suppressed', userId: 'u1', key: 'order-42-shipped', reason: 'muted' }]);
  });

  it('suppresses during quiet hours, start inclusive and end exclusive', async () => {
    const s = setup({ prefs: { quietHours: { start: 13, end: 15 } } });
    s.clock.t = at(12, 59);
    expect((await s.notifier.notify(user, msg({ key: 'a' }))).status).toBe('sent');
    s.clock.t = at(13, 0);
    expect(await s.notifier.notify(user, msg({ key: 'b' }))).toEqual({ status: 'suppressed', reason: 'quiet-hours' });
    s.clock.t = at(14, 59);
    expect((await s.notifier.notify(user, msg({ key: 'c' }))).status).toBe('suppressed');
    s.clock.t = at(15, 0);
    expect((await s.notifier.notify(user, msg({ key: 'd' }))).status).toBe('sent');
  });

  it('handles quiet hours that wrap past midnight', async () => {
    const s = setup({ prefs: { quietHours: { start: 22, end: 7 } } });
    const statusAt = async (hour, key) => { s.clock.t = at(hour, 30); return (await s.notifier.notify(user, msg({ key }))).status; };
    expect(await statusAt(21, 'k21')).toBe('sent');
    expect(await statusAt(22, 'k22')).toBe('suppressed');
    expect(await statusAt(23, 'k23')).toBe('suppressed');
    expect(await statusAt(3, 'k3')).toBe('suppressed');
    expect(await statusAt(6, 'k6')).toBe('suppressed');
    expect(await statusAt(7, 'k7')).toBe('sent');
    expect(await statusAt(12, 'k12')).toBe('sent');
  });

  it('treats equal start and end as no quiet hours', async () => {
    const s = setup({ prefs: { quietHours: { start: 9, end: 9 } } });
    s.clock.t = at(9, 15);
    expect((await s.notifier.notify(user, msg())).status).toBe('sent');
  });

  it('urgent messages ignore mutes and quiet hours', async () => {
    const s = setup({ prefs: { mutedTopics: ['security'], quietHours: { start: 0, end: 23 } } });
    s.clock.t = at(3);
    expect(await s.notifier.notify(user, msg({ topic: 'security', key: 'new-login', urgent: true })))
      .toEqual({ status: 'sent', channel: 'email' });
  });

  it('reads preferences per user, on every call', async () => {
    const store = { u1: { channels: ['sms'] }, u2: { channels: ['push'] } };
    const s = setup({ prefs: async (id) => store[id] ?? null });
    expect((await s.notifier.notify(user, msg())).channel).toBe('sms');
    expect((await s.notifier.notify({ id: 'u2' }, msg())).channel).toBe('push');
    store.u1 = { channels: ['push'] };
    expect((await s.notifier.notify(user, msg({ key: 'other' }))).channel).toBe('push');
  });
});

describe('deduplication', () => {
  it('suppresses the same key for the same user inside the window', async () => {
    const s = setup({ dedupeWindowMs: 60_000 });
    expect((await s.notifier.notify(user, msg())).status).toBe('sent');
    s.clock.t += 59_999;
    expect(await s.notifier.notify(user, msg())).toEqual({ status: 'suppressed', reason: 'duplicate' });
    s.clock.t += 1;
    expect((await s.notifier.notify(user, msg())).status).toBe('sent');
    expect(s.email.sent).toHaveLength(2);
  });

  it('defaults the window to ten minutes', async () => {
    const s = setup();
    await s.notifier.notify(user, msg());
    s.clock.t += 10 * 60 * 1000 - 1;
    expect((await s.notifier.notify(user, msg())).status).toBe('suppressed');
    s.clock.t += 1;
    expect((await s.notifier.notify(user, msg())).status).toBe('sent');
  });

  it('is per user and per key', async () => {
    const s = setup();
    await s.notifier.notify(user, msg());
    expect((await s.notifier.notify({ id: 'u2' }, msg())).status).toBe('sent');
    expect((await s.notifier.notify(user, msg({ key: 'order-43-shipped' }))).status).toBe('sent');
  });

  it('counts only successful deliveries, so a failed attempt can be retried', async () => {
    let healthy = false;
    const flaky = { id: 'email', supports: () => true, async send() { if (!healthy) throw new Error('down'); } };
    const s = setup({ channels: [flaky] });
    expect((await s.notifier.notify(user, msg())).status).toBe('undeliverable');
    healthy = true;
    expect((await s.notifier.notify(user, msg())).status).toBe('sent');
  });

  it('does not record a suppressed message as sent', async () => {
    const s = setup({ prefs: { quietHours: { start: 22, end: 7 } } });
    s.clock.t = at(23);
    expect((await s.notifier.notify(user, msg())).status).toBe('suppressed');
    s.clock.t = at(8);
    expect((await s.notifier.notify(user, msg())).status).toBe('sent');
  });

  it('treats a send still in flight as a duplicate (double-click, retrying job)', async () => {
    const pending = [];
    const slow = { id: 'email', supports: () => true, send: () => new Promise((resolve) => pending.push(resolve)) };
    const s = setup({ channels: [slow] });
    const first = s.notifier.notify(user, msg());
    const second = s.notifier.notify(user, msg());
    await flush();
    expect(pending).toHaveLength(1);
    expect(await second).toEqual({ status: 'suppressed', reason: 'duplicate' });
    pending[0]();
    expect(await first).toEqual({ status: 'sent', channel: 'email' });
  });

  it('releases the key when the in-flight send fails', async () => {
    const pending = [];
    const slow = { id: 'email', supports: () => true, send: () => new Promise((_, reject) => pending.push(reject)) };
    const s = setup({ channels: [slow] });
    const first = s.notifier.notify(user, msg());
    await flush();
    pending[0](new Error('down'));
    expect((await first).status).toBe('undeliverable');
    const again = s.notifier.notify(user, msg());
    await flush();
    expect(pending).toHaveLength(2);
    pending[1](new Error('still down'));
    expect((await again).status).toBe('undeliverable');
  });
});

describe('observers', () => {
  it('a throwing listener changes nothing: other listeners run and the result stands', async () => {
    const s = setup();
    const seen = [];
    s.notifier.on('sent', () => { throw new Error('audit log is down'); });
    s.notifier.on('sent', (e) => seen.push(e.channel));
    expect(await s.notifier.notify(user, msg())).toEqual({ status: 'sent', channel: 'email' });
    expect(seen).toEqual(['email']);
    expect(s.email.sent).toHaveLength(1);
  });

  it('on() returns an unsubscribe function', async () => {
    const s = setup();
    const seen = [];
    const off = s.notifier.on('sent', (e) => seen.push(e.key));
    await s.notifier.notify(user, msg({ key: 'one' }));
    off();
    await s.notifier.notify(user, msg({ key: 'two' }));
    expect(seen).toEqual(['one']);
  });

  it('propagates a failure to load preferences without sending anything', async () => {
    const s = setup({ prefs: async () => { throw new Error('prefs db down'); } });
    await expect(s.notifier.notify(user, msg())).rejects.toThrow('prefs db down');
    expect(s.email.sent).toEqual([]);
  });
});
