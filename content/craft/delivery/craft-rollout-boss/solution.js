/**
 * A staged rollout as a pure reducer: step(state, event) -> { state, actions }.
 * It never reads the clock (events carry `at`) and never calls the flag
 * service (it returns actions), so every transition is testable and replayable.
 */

const ACTIVE = new Set(['running', 'paused', 'awaiting-approval']);

/** Validates the plan and returns the initial state. */
export function createRollout(plan) {
  const { stages, bakeMs, approvalBefore = [] } = plan ?? {};
  const increasing = Array.isArray(stages) && stages.length > 0
    && stages.every((p, i) => typeof p === 'number' && p > 0 && (i === 0 || p > stages[i - 1]));
  if (!increasing || stages.at(-1) !== 100) {
    throw new RangeError('stages must be strictly increasing percentages above 0, ending at 100');
  }
  if (typeof bakeMs !== 'number' || !(bakeMs >= 0)) throw new RangeError('bakeMs must be a number >= 0');

  return {
    status: 'pending',
    percent: 0,
    stageIndex: -1,
    stageStartedAt: null,
    plan: { stages: [...stages], bakeMs, approvalBefore: [...approvalBefore] },
  };
}

const setPercent = (percent) => ({ type: 'set-percent', percent });

/** Moves to stage `index`; its bake starts at `at`. */
function enterStage(state, index, at) {
  const percent = state.plan.stages[index];
  return { state: { ...state, status: 'running', stageIndex: index, percent, stageStartedAt: at }, actions: [setPercent(percent)] };
}

function rollBack(state, reason) {
  return {
    state: { ...state, status: 'rolled-back', percent: 0 },
    actions: [setPercent(0), { type: 'notify', event: 'rolled-back', reason }],
  };
}

/** A healthy tick while running: advance, gate or finish once the stage has baked. */
function onHealthy(state, at) {
  const { stages, bakeMs, approvalBefore } = state.plan;
  if (at - state.stageStartedAt < bakeMs) return { state, actions: [] };

  const next = state.stageIndex + 1;
  if (next === stages.length) {
    return { state: { ...state, status: 'complete' }, actions: [{ type: 'notify', event: 'complete' }] };
  }
  if (approvalBefore.includes(stages[next])) {
    return { state: { ...state, status: 'awaiting-approval' }, actions: [{ type: 'notify', event: 'awaiting-approval' }] };
  }
  return enterStage(state, next, at);
}

/** Applies one event. Returns the next state and the actions the caller must perform. */
export function step(state, event) {
  const { status } = state;
  const invalid = () => new Error(`cannot ${event.type} while ${status}`);

  switch (event.type) {
    case 'start':
      if (status !== 'pending') throw invalid();
      return enterStage(state, 0, event.at);

    case 'tick':
      if (!ACTIVE.has(status)) throw invalid();
      // Safety beats progress: unhealthy rolls back whatever else is going on.
      if (event.verdict === 'unhealthy') return rollBack(state, 'unhealthy');
      if (status === 'running' && event.verdict === 'healthy') return onHealthy(state, event.at);
      return { state, actions: [] };

    case 'approve':
      if (status !== 'awaiting-approval') throw invalid();
      return enterStage(state, state.stageIndex + 1, event.at);

    case 'pause':
      if (status !== 'running') throw invalid();
      return { state: { ...state, status: 'paused' }, actions: [] };

    case 'resume':
      if (status !== 'paused') throw invalid();
      // Time spent paused is not bake time.
      return { state: { ...state, status: 'running', stageStartedAt: event.at }, actions: [] };

    case 'abort':
      if (!ACTIVE.has(status)) throw invalid();
      return rollBack(state, 'aborted');

    default:
      throw invalid();
  }
}
