const { createRollout, step } = solution;

const MIN = 60_000;
const PLAN = () => ({ stages: [1, 10, 50, 100], bakeMs: 10 * MIN });

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Applies events in order, freezing every state first so any mutation throws. Returns the last state and every action. */
function run(plan, events) {
  let state = createRollout(plan);
  const actions = [];
  for (const event of events) {
    const out = step(deepFreeze(state), event);
    actions.push(...out.actions);
    state = out.state;
  }
  return { state, actions };
}

const start = (at = 0) => ({ type: 'start', at });
const healthy = (at) => ({ type: 'tick', at, verdict: 'healthy' });
const unhealthy = (at) => ({ type: 'tick', at, verdict: 'unhealthy' });
const insufficient = (at) => ({ type: 'tick', at, verdict: 'insufficient' });
const setPercents = (actions) => actions.filter((a) => a.type === 'set-percent').map((a) => a.percent);
const ROLLED_BACK = (reason) => [{ type: 'set-percent', percent: 0 }, { type: 'notify', event: 'rolled-back', reason }];

describe('createRollout', () => {
  it('starts pending at 0 %', () => {
    const s = createRollout(PLAN());
    expect(s.status).toBe('pending');
    expect(s.percent).toBe(0);
  });

  it('rejects a plan that is not strictly increasing, does not end at 100, or has a bad bake time', () => {
    const bad = [
      { stages: [10, 5, 100], bakeMs: 0 },
      { stages: [10, 10, 100], bakeMs: 0 },
      { stages: [1, 10, 50], bakeMs: 0 },
      { stages: [0, 50, 100], bakeMs: 0 },
      { stages: [], bakeMs: 0 },
      { stages: [1, 100], bakeMs: -1 },
      { stages: [1, 100] },
    ];
    for (const plan of bad) expect(() => createRollout(plan)).toThrow(RangeError);
    expect(() => createRollout({ stages: [100], bakeMs: 0 })).not.toThrow();
  });
});

describe('step: ramping up', () => {
  it('starts at the first stage', () => {
    const { state, actions } = run(PLAN(), [start()]);
    expect(state.status).toBe('running');
    expect(state.percent).toBe(1);
    expect(actions).toEqual([{ type: 'set-percent', percent: 1 }]);
  });

  it('advances only after the stage has baked, and exactly at bakeMs', () => {
    const early = run(PLAN(), [start(0), healthy(10 * MIN - 1)]);
    expect(early.state.percent).toBe(1);
    expect(early.actions).toEqual([{ type: 'set-percent', percent: 1 }]);
    const baked = run(PLAN(), [start(0), healthy(10 * MIN)]);
    expect(baked.state.percent).toBe(10);
    expect(setPercents(baked.actions)).toEqual([1, 10]);
  });

  it('restarts the bake at every stage', () => {
    const { state } = run(PLAN(), [start(0), healthy(10 * MIN), healthy(15 * MIN)]);
    expect(state.percent).toBe(10);
    const later = run(PLAN(), [start(0), healthy(10 * MIN), healthy(20 * MIN)]);
    expect(later.state.percent).toBe(50);
  });

  it('does not advance on an insufficient tick, however long it has been', () => {
    const { state, actions } = run(PLAN(), [start(0), insufficient(60 * MIN)]);
    expect(state.status).toBe('running');
    expect(state.percent).toBe(1);
    expect(setPercents(actions)).toEqual([1]);
  });

  it('bakes the last stage too, then completes', () => {
    const at100 = run(PLAN(), [start(0), healthy(10 * MIN), healthy(20 * MIN), healthy(30 * MIN)]);
    expect(at100.state.percent).toBe(100);
    expect(at100.state.status).toBe('running');
    const done = run(PLAN(), [start(0), healthy(10 * MIN), healthy(20 * MIN), healthy(30 * MIN), healthy(40 * MIN)]);
    expect(done.state.status).toBe('complete');
    expect(done.state.percent).toBe(100);
    expect(done.actions.at(-1)).toEqual({ type: 'notify', event: 'complete' });
    expect(setPercents(done.actions)).toEqual([1, 10, 50, 100]);
  });

  it('with bakeMs 0, advances one stage per healthy tick', () => {
    const { state, actions } = run({ stages: [5, 100], bakeMs: 0 }, [start(0), healthy(0), healthy(0)]);
    expect(state.status).toBe('complete');
    expect(setPercents(actions)).toEqual([5, 100]);
  });
});

describe('step: rolling back', () => {
  it('rolls back on an unhealthy tick while running, even before the bake is over', () => {
    const { state, actions } = run(PLAN(), [start(0), healthy(10 * MIN), unhealthy(11 * MIN)]);
    expect(state.status).toBe('rolled-back');
    expect(state.percent).toBe(0);
    expect(actions.slice(-2)).toEqual(ROLLED_BACK('unhealthy'));
  });

  it('rolls back on an unhealthy tick while paused', () => {
    const { state, actions } = run(PLAN(), [start(0), { type: 'pause', at: MIN }, unhealthy(2 * MIN)]);
    expect(state.status).toBe('rolled-back');
    expect(actions.slice(-2)).toEqual(ROLLED_BACK('unhealthy'));
  });

  it('rolls back on an unhealthy tick while awaiting approval', () => {
    const plan = { ...PLAN(), approvalBefore: [100] };
    const { state, actions } = run(plan, [start(0), healthy(10 * MIN), healthy(20 * MIN), healthy(30 * MIN), unhealthy(31 * MIN)]);
    expect(state.status).toBe('rolled-back');
    expect(state.percent).toBe(0);
    expect(actions.slice(-2)).toEqual(ROLLED_BACK('unhealthy'));
  });

  it('aborts from running, paused or awaiting approval', () => {
    expect(run(PLAN(), [start(0), { type: 'abort', at: 1 }]).actions.slice(-2)).toEqual(ROLLED_BACK('aborted'));
    expect(run(PLAN(), [start(0), { type: 'pause', at: 1 }, { type: 'abort', at: 2 }]).state.status).toBe('rolled-back');
    const plan = { ...PLAN(), approvalBefore: [10] };
    const gated = run(plan, [start(0), healthy(10 * MIN), { type: 'abort', at: 11 * MIN }]);
    expect(gated.state.status).toBe('rolled-back');
    expect(gated.state.percent).toBe(0);
  });
});

describe('step: approval gates', () => {
  const plan = () => ({ ...PLAN(), approvalBefore: [100] });

  it('waits for approval before a gated stage, keeping the current percentage', () => {
    const { state, actions } = run(plan(), [start(0), healthy(10 * MIN), healthy(20 * MIN), healthy(30 * MIN)]);
    expect(state.status).toBe('awaiting-approval');
    expect(state.percent).toBe(50);
    expect(actions.at(-1)).toEqual({ type: 'notify', event: 'awaiting-approval' });
  });

  it('ignores healthy ticks while waiting, and advances on approve', () => {
    const waiting = [start(0), healthy(10 * MIN), healthy(20 * MIN), healthy(30 * MIN), healthy(90 * MIN)];
    expect(run(plan(), waiting).state.status).toBe('awaiting-approval');
    const { state, actions } = run(plan(), [...waiting, { type: 'approve', at: 95 * MIN }]);
    expect(state.status).toBe('running');
    expect(state.percent).toBe(100);
    expect(actions.at(-1)).toEqual({ type: 'set-percent', percent: 100 });
  });

  it('starts the bake at the approval, not at the gate', () => {
    const events = [start(0), healthy(10 * MIN), healthy(20 * MIN), healthy(30 * MIN), { type: 'approve', at: 60 * MIN }];
    expect(run(plan(), [...events, healthy(65 * MIN)]).state.status).toBe('running');
    expect(run(plan(), [...events, healthy(70 * MIN)]).state.status).toBe('complete');
  });
});

describe('step: pause and resume', () => {
  it('does not advance while paused', () => {
    const { state, actions } = run(PLAN(), [start(0), { type: 'pause', at: MIN }, healthy(30 * MIN)]);
    expect(state.status).toBe('paused');
    expect(state.percent).toBe(1);
    expect(setPercents(actions)).toEqual([1]);
  });

  it('restarts the bake on resume: time spent paused is not bake time', () => {
    const events = [start(0), { type: 'pause', at: 9 * MIN }, { type: 'resume', at: 60 * MIN }];
    const soon = run(PLAN(), [...events, healthy(61 * MIN)]);
    expect(soon.state.status).toBe('running');
    expect(soon.state.percent).toBe(1);
    expect(run(PLAN(), [...events, healthy(70 * MIN)]).state.percent).toBe(10);
  });

  it('returns no actions for pause and resume', () => {
    const s = run(PLAN(), [start(0)]).state;
    const paused = step(deepFreeze(s), { type: 'pause', at: 1 });
    expect(paused.actions).toEqual([]);
    expect(step(deepFreeze(paused.state), { type: 'resume', at: 2 }).actions).toEqual([]);
  });
});

describe('step: impossible events', () => {
  const expectInvalid = (events, bad, message) => {
    const { state } = run(PLAN(), events);
    expect(() => step(deepFreeze(state), bad)).toThrow(message);
  };

  it('throws for events that make no sense in the current status', () => {
    expectInvalid([], healthy(0), 'cannot tick while pending');
    expectInvalid([start(0)], start(1), 'cannot start while running');
    expectInvalid([start(0)], { type: 'approve', at: 1 }, 'cannot approve while running');
    expectInvalid([start(0)], { type: 'resume', at: 1 }, 'cannot resume while running');
    expectInvalid([start(0), { type: 'pause', at: 1 }], { type: 'pause', at: 2 }, 'cannot pause while paused');
    expectInvalid([start(0)], { type: 'deploy', at: 1 }, 'cannot deploy while running');
  });

  it('throws for any event after the rollout has finished', () => {
    expectInvalid([start(0), { type: 'abort', at: 1 }], healthy(2), 'cannot tick while rolled-back');
    expectInvalid([start(0), { type: 'abort', at: 1 }], { type: 'abort', at: 2 }, 'cannot abort while rolled-back');
    const all = [start(0), healthy(10 * MIN), healthy(20 * MIN), healthy(30 * MIN), healthy(40 * MIN)];
    expectInvalid(all, start(50 * MIN), 'cannot start while complete');
  });
});

describe('step: purity', () => {
  it('never modifies the state it is given, so old states can be replayed', () => {
    const s1 = run(PLAN(), [start(0)]).state;
    const snapshot = JSON.stringify(s1);
    const a = step(deepFreeze(s1), healthy(10 * MIN));
    const b = step(s1, unhealthy(10 * MIN));
    expect(JSON.stringify(s1)).toBe(snapshot);
    expect(a.state.percent).toBe(10);
    expect(b.state.status).toBe('rolled-back');
    expect(s1.status).toBe('running');
  });
});
