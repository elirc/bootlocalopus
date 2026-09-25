// Captured at load time, before any test could replace the global.
const realSetImmediate = globalThis.setImmediate;
const LOOP_LIMIT = 1000;

// One real macrotask: every pending microtask (promise callback) runs first.
const drainMicrotasks = () => new Promise((resolve) => realSetImmediate(resolve));

export function createClock({ now: start = 0 } = {}) {
  let now = start;
  let nextId = 1;
  let nextOrder = 1; // tie-breaker: scheduling order for timers due at the same time
  const timers = new Map(); // id -> { id, due, order, fn, args, interval }

  function add(fn, delay, args, interval) {
    const id = nextId++;
    timers.set(id, { id, due: now + delay, order: nextOrder++, fn, args, interval });
    return id;
  }

  function clear(id) {
    timers.delete(id);
  }

  // The earliest timer due at or before `limit`, or undefined.
  function nextDue(limit) {
    let best;
    for (const t of timers.values()) {
      if (t.due > limit) continue;
      if (!best || t.due < best.due || (t.due === best.due && t.order < best.order)) best = t;
    }
    return best;
  }

  function fire(timer) {
    now = timer.due;
    if (timer.interval === null) {
      timers.delete(timer.id);
    } else {
      // Reschedule from the due time, not from "now after the callback": no drift.
      timer.due += timer.interval;
      timer.order = nextOrder++;
    }
    timer.fn(...timer.args); // may throw: tick rethrows with the clock at this due time
  }

  const toDelay = (ms) => {
    const n = Number(ms);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  return {
    now: () => now,

    setTimeout: (fn, ms, ...args) => add(fn, toDelay(ms), args, null),
    setInterval: (fn, ms, ...args) => {
      const every = Math.max(1, toDelay(ms));
      return add(fn, every, args, every);
    },
    clearTimeout: clear,
    clearInterval: clear,
    pending: () => timers.size,

    tick(ms) {
      const target = now + toDelay(ms);
      let ran = 0;
      for (let t = nextDue(target); t; t = nextDue(target)) {
        fire(t);
        ran++;
      }
      now = target;
      return ran;
    },

    async tickAsync(ms) {
      const target = now + toDelay(ms);
      let ran = 0;
      await drainMicrotasks();
      for (let t = nextDue(target); t; t = nextDue(target)) {
        fire(t);
        ran++;
        // Let `await`ing code continue (and schedule more timers) before the next one.
        await drainMicrotasks();
      }
      now = target;
      await drainMicrotasks();
      return ran;
    },

    runAll() {
      let ran = 0;
      while (timers.size > 0) {
        if (ran >= LOOP_LIMIT) {
          throw new Error(`Aborting after running ${LOOP_LIMIT} timers, assuming an infinite loop`);
        }
        fire(nextDue(Infinity));
        ran++;
      }
      return ran;
    },
  };
}
