export class StartupError extends Error {
  constructor(component, cause) {
    super(`Component "${component}" failed to start: ${cause?.message ?? String(cause)}`, { cause });
    this.name = 'StartupError';
    this.component = component;
  }
}

export function createLifecycle() {
  const components = new Map(); // name -> { start, stop, dependsOn }, in registration order
  let state = 'stopped';
  let started = []; // names, in the order they actually started
  let starting = null; // the in-flight start() promise
  let stopping = null; // the in-flight stop() promise

  /** Dependencies first; ties keep registration order. Throws on unknown names and cycles. */
  function startOrder() {
    const order = [];
    const status = new Map(); // name -> 'visiting' | 'done'
    const visit = (name, path) => {
      if (status.get(name) === 'done') return;
      if (status.get(name) === 'visiting') throw new Error(`Dependency cycle: ${[...path, name].join(' -> ')}`);
      const component = components.get(name);
      if (!component) throw new Error(`"${path.at(-1)}" depends on unknown component "${name}"`);
      status.set(name, 'visiting');
      for (const dep of component.dependsOn) visit(dep, [...path, name]);
      status.set(name, 'done');
      order.push(name);
    };
    for (const name of components.keys()) visit(name, []);
    return order;
  }

  async function stopStarted() {
    const errors = [];
    for (const name of [...started].reverse()) {
      try {
        await components.get(name).stop();
      } catch (error) {
        errors.push(error);
      }
    }
    started = [];
    return errors;
  }

  async function doStart() {
    const order = startOrder(); // before anything runs: a bad graph starts nothing
    for (const name of order) {
      try {
        await components.get(name).start();
      } catch (error) {
        await stopStarted(); // roll back; the startup failure is the error that matters
        throw new StartupError(name, error);
      }
      started.push(name);
    }
  }

  async function doStop() {
    const errors = await stopStarted();
    if (errors.length > 0) throw new AggregateError(errors, `${errors.length} component(s) failed to stop`);
  }

  const lifecycle = {
    get state() { return state; },

    register(name, { start = async () => {}, stop = async () => {} } = {}, { dependsOn = [] } = {}) {
      if (state !== 'stopped') throw new Error('Cannot register components while running');
      if (components.has(name)) throw new Error(`Component "${name}" is already registered`);
      components.set(name, { start, stop, dependsOn: [...dependsOn] });
    },

    start() {
      if (state === 'started') return Promise.resolve();
      if (starting) return starting;
      if (stopping) return stopping.catch(() => {}).then(() => lifecycle.start());
      state = 'starting';
      starting = doStart().then(
        () => { state = 'started'; },
        (error) => { state = 'stopped'; throw error; },
      ).finally(() => { starting = null; });
      return starting;
    },

    stop() {
      if (stopping) return stopping;
      if (starting) return starting.catch(() => {}).then(() => lifecycle.stop());
      if (state === 'stopped') return Promise.resolve();
      state = 'stopping';
      stopping = doStop().finally(() => {
        state = 'stopped';
        stopping = null;
      });
      return stopping;
    },
  };
  return lifecycle;
}
