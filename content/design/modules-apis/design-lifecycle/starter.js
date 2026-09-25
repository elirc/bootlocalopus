export class StartupError extends Error {}

// Today, index.js does this at the top level:
//
//   await config.load();
//   await db.connect();
//   await server.listen(3000);   // throws EADDRINUSE: db stays connected, process hangs
//
// and shutdown is whatever order someone remembered.

export function createLifecycle() {
  const components = new Map();
  let state = 'stopped';

  return {
    get state() { return state; },

    register(name, { start = async () => {}, stop = async () => {} } = {}, { dependsOn = [] } = {}) {
      components.set(name, { start, stop, dependsOn });
    },

    async start() {
      throw new Error('TODO');
    },

    async stop() {
      throw new Error('TODO');
    },
  };
}
