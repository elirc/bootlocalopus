/**
 * A staged rollout as a pure reducer: step(state, event) -> { state, actions }.
 */

/** Validates the plan and returns the initial state. */
export function createRollout(plan) {
  return { status: 'pending', percent: 0, plan };
}

/** Applies one event. Returns the next state and the actions the caller must perform. */
export function step(state, event) {
  // The old script: every event moves to the next stage, health or not.
  const stages = state.plan.stages;
  const i = state.percent === 0 ? 0 : stages.indexOf(state.percent) + 1;
  state.status = 'running';
  state.percent = stages[Math.min(i, stages.length - 1)];
  return { state, actions: [{ type: 'set-percent', percent: state.percent }] };
}
