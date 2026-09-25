const { createMailer, DeprecationError } = solution;

const setup = (options = {}) => {
  const delivered = [];
  const warnings = [];
  let n = 0;
  const transport = { async deliver(envelope) { delivered.push(envelope); return { messageId: `m-${++n}` }; } };
  const mailer = createMailer({ transport, warn: (message, code) => warnings.push({ message, code }), ...options });
  return { mailer, delivered, warnings, codes: () => warnings.map((w) => w.code) };
};
const rejection = async (promise) => {
  try { await promise; } catch (e) { return e; }
  throw new Error('expected a rejection');
};

describe('the new API', () => {
  it('delivers a normalised envelope and resolves with the message id', async () => {
    const s = setup();
    expect(await s.mailer.sendEmail({ to: 'ada@example.com', subject: 'Hi', text: 'Hello' })).toBe('m-1');
    expect(s.delivered).toEqual([{ to: ['ada@example.com'], cc: [], subject: 'Hi', text: 'Hello' }]);
    expect(Object.keys(s.delivered[0]).sort()).toEqual(['cc', 'subject', 'text', 'to']);
  });

  it('accepts lists, cc and html', async () => {
    const s = setup();
    await s.mailer.sendEmail({ to: ['a@x.io', 'b@x.io'], cc: 'c@x.io', subject: 'S', html: '<p>x</p>', text: 'x' });
    expect(s.delivered[0]).toEqual({ to: ['a@x.io', 'b@x.io'], cc: ['c@x.io'], subject: 'S', html: '<p>x</p>', text: 'x' });
  });

  it('never warns', async () => {
    const s = setup();
    await s.mailer.sendEmail({ to: 'a@x.io', subject: 'S', text: 'x' });
    await s.mailer.sendEmail({ to: ['a@x.io'], subject: 'S', html: 'x' });
    expect(s.warnings).toEqual([]);
  });

  it('rejects incomplete messages with a TypeError and delivers nothing', async () => {
    const s = setup();
    expect(await rejection(s.mailer.sendEmail({ to: [], subject: 'S', text: 'x' }))).toBeInstanceOf(TypeError);
    expect(await rejection(s.mailer.sendEmail({ to: 'a@x.io', text: 'x' }))).toBeInstanceOf(TypeError);
    expect(await rejection(s.mailer.sendEmail({ to: 'a@x.io', subject: 'S' }))).toBeInstanceOf(TypeError);
    expect(s.delivered).toEqual([]);
  });

  it('does not mutate the caller\'s message or its arrays', async () => {
    const s = setup();
    const to = ['a@x.io'];
    const message = { to, subject: 'S', body: 'x' };
    await s.mailer.sendEmail(message);
    expect(message).toEqual({ to: ['a@x.io'], subject: 'S', body: 'x' });
    s.delivered[0].to.push('intruder@x.io');
    expect(to).toEqual(['a@x.io']);
  });
});

describe('old calls keep working, exactly as before', () => {
  it('positional (to, subject, body) sends the same envelope as the new form', async () => {
    const s = setup();
    expect(await s.mailer.sendEmail('ada@example.com', 'Hi', 'Hello')).toBe('m-1');
    await s.mailer.sendEmail({ to: 'ada@example.com', subject: 'Hi', text: 'Hello' });
    expect(s.delivered[0]).toEqual(s.delivered[1]);
  });

  it('positional isHtml = true sends html instead of text', async () => {
    const s = setup();
    await s.mailer.sendEmail(['a@x.io', 'b@x.io'], 'Hi', '<b>Hello</b>', true);
    expect(s.delivered[0]).toEqual({ to: ['a@x.io', 'b@x.io'], cc: [], subject: 'Hi', html: '<b>Hello</b>' });
  });

  it('the old "body" field becomes "text"', async () => {
    const s = setup();
    await s.mailer.sendEmail({ to: 'a@x.io', subject: 'S', body: 'Hello' });
    expect(s.delivered[0]).toEqual({ to: ['a@x.io'], cc: [], subject: 'S', text: 'Hello' });
  });

  it('the old name send() still works, with either calling style', async () => {
    const s = setup();
    expect(await s.mailer.send({ to: 'a@x.io', subject: 'S', text: 'x' })).toBe('m-1');
    expect(await s.mailer.send('a@x.io', 'S', 'x')).toBe('m-2');
    expect(s.delivered[0]).toEqual(s.delivered[1]);
  });

  it('refuses an ambiguous message that has both "body" and "text"', async () => {
    const s = setup();
    const e = await rejection(s.mailer.sendEmail({ to: 'a@x.io', subject: 'S', body: 'one', text: 'two' }));
    expect(e).toBeInstanceOf(TypeError);
    expect(e.message).toBe('Use either "body" or "text", not both');
    expect(s.delivered).toEqual([]);
  });
});

describe('deprecation warnings', () => {
  it('warns with a stable code for each deprecated usage', async () => {
    const s = setup();
    await s.mailer.sendEmail('a@x.io', 'S', 'x');
    expect(s.codes()).toEqual(['DEP_MAIL_001']);
    await s.mailer.sendEmail({ to: 'a@x.io', subject: 'S', body: 'x' });
    expect(s.codes()).toEqual(['DEP_MAIL_001', 'DEP_MAIL_002']);
    await s.mailer.send({ to: 'a@x.io', subject: 'S', text: 'x' });
    expect(s.codes()).toEqual(['DEP_MAIL_001', 'DEP_MAIL_002', 'DEP_MAIL_003']);
    for (const w of s.warnings) {
      expect(typeof w.message).toBe('string');
      expect(w.message.length).toBeGreaterThan(10);
    }
  });

  it('warns once per code, not once per call (a hot path must not flood the logs)', async () => {
    const s = setup();
    for (let i = 0; i < 5; i++) await s.mailer.sendEmail('a@x.io', 'S', 'x');
    for (let i = 0; i < 5; i++) await s.mailer.send({ to: 'a@x.io', subject: 'S', text: 'x' });
    expect(s.codes()).toEqual(['DEP_MAIL_001', 'DEP_MAIL_003']);
    expect(s.delivered).toHaveLength(10);
  });

  it('an old call through the old name reports both deprecations', async () => {
    const s = setup();
    await s.mailer.send('a@x.io', 'S', 'x');
    expect(s.codes().sort()).toEqual(['DEP_MAIL_001', 'DEP_MAIL_003']);
  });

  it('keeps "once" per mailer instance', async () => {
    const a = setup();
    const b = setup();
    await a.mailer.sendEmail('a@x.io', 'S', 'x');
    await b.mailer.sendEmail('a@x.io', 'S', 'x');
    expect(a.codes()).toEqual(['DEP_MAIL_001']);
    expect(b.codes()).toEqual(['DEP_MAIL_001']);
  });
});

describe('throwOnDeprecation (for CI, to find every old call site)', () => {
  it('rejects every deprecated call with DeprecationError and sends nothing', async () => {
    const s = setup({ throwOnDeprecation: true });
    for (let i = 0; i < 2; i++) {
      const e = await rejection(s.mailer.sendEmail('a@x.io', 'S', 'x'));
      expect(e).toBeInstanceOf(DeprecationError);
      expect(e.name).toBe('DeprecationError');
      expect(e.code).toBe('DEP_MAIL_001');
    }
    expect((await rejection(s.mailer.sendEmail({ to: 'a@x.io', subject: 'S', body: 'x' }))).code).toBe('DEP_MAIL_002');
    expect((await rejection(s.mailer.send({ to: 'a@x.io', subject: 'S', text: 'x' }))).code).toBe('DEP_MAIL_003');
    expect(s.delivered).toEqual([]);
    expect(s.warnings).toEqual([]);
  });

  it('still lets the new API through', async () => {
    const s = setup({ throwOnDeprecation: true });
    expect(await s.mailer.sendEmail({ to: 'a@x.io', subject: 'S', text: 'x' })).toBe('m-1');
  });
});
