export function createClock({ now = 0 } = {}) {
  // TODO: keep a list of timers { id, due, fn, args, interval } and a fake `now`.
  const notYet = (name) => () => {
    throw new Error(`clock.${name}: not implemented`);
  };
  return {
    now: notYet('now'),
    setTimeout: notYet('setTimeout'),
    setInterval: notYet('setInterval'),
    clearTimeout: notYet('clearTimeout'),
    clearInterval: notYet('clearInterval'),
    pending: notYet('pending'),
    tick: notYet('tick'),
    tickAsync: async () => notYet('tickAsync')(),
    runAll: notYet('runAll'),
  };
}
