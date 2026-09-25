const { createTicket, transition, can, InvalidTransitionError, REOPEN_WINDOW_MS } = solution;
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2024, 0, 1);

const run = (events, start = createTicket('T-1')) => events.reduce(transition, start);
const thrown = (fn) => { try { fn(); } catch (e) { return e; } throw new Error('expected a throw'); };

describe('the happy path', () => {
  it('open → assigned → waiting → assigned → resolved → closed', () => {
    let t = createTicket('T-1');
    expect(t).toEqual({ id: 'T-1', status: 'open', assignee: null, resolvedAt: null });
    t = transition(t, { type: 'ASSIGN', agent: 'ada' });
    expect(t).toEqual({ id: 'T-1', status: 'assigned', assignee: 'ada', resolvedAt: null });
    t = transition(t, { type: 'ASK_CUSTOMER' });
    expect(t.status).toBe('waiting');
    t = transition(t, { type: 'CUSTOMER_REPLIED', at: T0 });
    expect(t.status).toBe('assigned');
    t = transition(t, { type: 'RESOLVE', at: T0 + 5 });
    expect(t).toEqual({ id: 'T-1', status: 'resolved', assignee: 'ada', resolvedAt: T0 + 5 });
    t = transition(t, { type: 'CLOSE' });
    expect(t.status).toBe('closed');
    expect(t.assignee).toBe('ada');
  });
  it('reassigning keeps the status and changes the agent', () => {
    const t = run([{ type: 'ASSIGN', agent: 'ada' }, { type: 'ASSIGN', agent: 'grace' }]);
    expect(t.status).toBe('assigned');
    expect(t.assignee).toBe('grace');
  });
  it('resolves straight from waiting', () => {
    const t = run([{ type: 'ASSIGN', agent: 'ada' }, { type: 'ASK_CUSTOMER' }, { type: 'RESOLVE', at: T0 }]);
    expect(t.status).toBe('resolved');
    expect(t.resolvedAt).toBe(T0);
  });
  it('closes spam straight from open', () => {
    expect(transition(createTicket('T-2'), { type: 'CLOSE' }).status).toBe('closed');
  });
  it('never mutates its input', () => {
    const t = createTicket('T-3');
    const copy = { ...t };
    const n = transition(t, { type: 'ASSIGN', agent: 'ada' });
    expect(t).toEqual(copy);
    expect(n).not.toBe(t);
  });
});

describe('reopening a resolved ticket', () => {
  const resolved = () => run([{ type: 'ASSIGN', agent: 'ada' }, { type: 'RESOLVE', at: T0 }]);
  it('reopens within the window, keeping the assignee', () => {
    expect(REOPEN_WINDOW_MS).toBe(7 * DAY);
    const t = transition(resolved(), { type: 'CUSTOMER_REPLIED', at: T0 + 3 * DAY });
    expect(t).toEqual({ id: 'T-1', status: 'assigned', assignee: 'ada', resolvedAt: null });
  });
  it('the window is inclusive', () => {
    expect(transition(resolved(), { type: 'CUSTOMER_REPLIED', at: T0 + 7 * DAY }).status).toBe('assigned');
  });
  it('rejects a reply after the window', () => {
    const e = thrown(() => transition(resolved(), { type: 'CUSTOMER_REPLIED', at: T0 + 7 * DAY + 1 }));
    expect(e).toBeInstanceOf(InvalidTransitionError);
    expect(e.from).toBe('resolved');
    expect(e.event).toBe('CUSTOMER_REPLIED');
  });
  it('can() applies the guard too', () => {
    expect(can(resolved(), { type: 'CUSTOMER_REPLIED', at: T0 + DAY })).toBe(true);
    expect(can(resolved(), { type: 'CUSTOMER_REPLIED', at: T0 + 8 * DAY })).toBe(false);
  });
});

describe('illegal transitions', () => {
  it('throws InvalidTransitionError with from and event', () => {
    const e = thrown(() => transition(createTicket('T-1'), { type: 'RESOLVE', at: T0 }));
    expect(e).toBeInstanceOf(InvalidTransitionError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('InvalidTransitionError');
    expect(e.from).toBe('open');
    expect(e.event).toBe('RESOLVE');
  });
  it('a closed ticket accepts nothing', () => {
    const closed = run([{ type: 'CLOSE' }]);
    for (const event of [{ type: 'ASSIGN', agent: 'x' }, { type: 'CLOSE' }, { type: 'RESOLVE', at: T0 }, { type: 'CUSTOMER_REPLIED', at: T0 }, { type: 'ASK_CUSTOMER' }]) {
      const e = thrown(() => transition(closed, event));
      expect(e).toBeInstanceOf(InvalidTransitionError);
      expect(e.from).toBe('closed');
    }
  });
  it('rejects events that look plausible but are not in the table', () => {
    const assigned = run([{ type: 'ASSIGN', agent: 'ada' }]);
    const waiting = run([{ type: 'ASK_CUSTOMER' }], assigned);
    expect(() => transition(assigned, { type: 'CLOSE' })).toThrow(InvalidTransitionError);
    expect(() => transition(assigned, { type: 'CUSTOMER_REPLIED', at: T0 })).toThrow(InvalidTransitionError);
    expect(() => transition(waiting, { type: 'ASSIGN', agent: 'bob' })).toThrow(InvalidTransitionError);
    expect(() => transition(waiting, { type: 'ASK_CUSTOMER' })).toThrow(InvalidTransitionError);
    expect(() => transition(createTicket('x'), { type: 'ASK_CUSTOMER' })).toThrow(InvalidTransitionError);
  });
  it('rejects unknown event types, including prototype names', () => {
    for (const type of ['REOPEN', 'toString', 'constructor', '__proto__', undefined]) {
      expect(() => transition(createTicket('x'), { type })).toThrow(InvalidTransitionError);
      expect(can(createTicket('x'), { type })).toBe(false);
    }
  });
});

describe('can() agrees with transition() everywhere', () => {
  it('for every status and event', () => {
    const tickets = [
      createTicket('a'),
      run([{ type: 'ASSIGN', agent: 'ada' }]),
      run([{ type: 'ASSIGN', agent: 'ada' }, { type: 'ASK_CUSTOMER' }]),
      run([{ type: 'ASSIGN', agent: 'ada' }, { type: 'RESOLVE', at: T0 }]),
      run([{ type: 'CLOSE' }]),
    ];
    const events = [
      { type: 'ASSIGN', agent: 'z' }, { type: 'CLOSE' }, { type: 'ASK_CUSTOMER' },
      { type: 'RESOLVE', at: T0 + 1 }, { type: 'CUSTOMER_REPLIED', at: T0 + DAY }, { type: 'CUSTOMER_REPLIED', at: T0 + 30 * DAY },
    ];
    let legal = 0;
    for (const t of tickets) {
      for (const e of events) {
        let ok = true;
        try { transition(t, e); } catch (err) { ok = false; expect(err).toBeInstanceOf(InvalidTransitionError); }
        expect(can(t, e)).toBe(ok);
        if (ok) legal++;
      }
    }
    expect(legal).toBe(10);
  });
});
