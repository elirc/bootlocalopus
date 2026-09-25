export class PluginError extends Error {
  constructor(plugin, hook, cause) {
    super(`[${plugin}] ${hook} failed: ${cause?.message ?? String(cause)}`, { cause });
    this.name = 'PluginError';
    this.plugin = plugin;
    this.hook = hook;
  }
}

export class ValidationError extends Error {
  constructor(message, plugin) {
    super(message);
    this.name = 'ValidationError';
    this.plugin = plugin;
  }
}

const PHASES = { pre: 0, normal: 1, post: 2 };

function order(plugins) {
  const seen = new Set();
  for (const plugin of plugins) {
    if (typeof plugin?.name !== 'string' || plugin.name === '') throw new TypeError('Every plugin needs a name');
    if (seen.has(plugin.name)) throw new Error(`Plugin "${plugin.name}" is registered twice`);
    seen.add(plugin.name);
    if (plugin.enforce !== undefined && plugin.enforce !== 'pre' && plugin.enforce !== 'post') {
      throw new TypeError(`Plugin "${plugin.name}": enforce must be 'pre' or 'post'`);
    }
  }
  const phase = (p) => PHASES[p.enforce ?? 'normal'];
  return [...plugins].sort((a, b) => phase(a) - phase(b)); // stable: ties keep registration order
}

export function createPipeline({ plugins = [], onPluginError = () => {} } = {}) {
  const ordered = order(plugins);
  const withHook = (hook) => ordered.filter((p) => typeof p[hook] === 'function');

  return {
    names: () => ordered.map((p) => p.name),

    async run(input) {
      const ctx = { meta: {} };
      let value = input;

      // Waterfall: each transform sees the previous one's output.
      for (const plugin of withHook('transform')) {
        let out;
        try {
          out = await plugin.transform(value, ctx); // called as a method: `this` is the plugin
        } catch (error) {
          throw new PluginError(plugin.name, 'transform', error);
        }
        if (out !== undefined) value = out;
      }

      // Bail: the first plugin that objects stops the run.
      for (const plugin of withHook('validate')) {
        let problem;
        try {
          problem = await plugin.validate(value, ctx);
        } catch (error) {
          throw new PluginError(plugin.name, 'validate', error);
        }
        if (typeof problem === 'string') throw new ValidationError(problem, plugin.name);
      }

      // Notify: every listener runs; one failing never fails the run.
      for (const plugin of withHook('onComplete')) {
        try {
          await plugin.onComplete(value, ctx);
        } catch (error) {
          try {
            onPluginError(error, { plugin: plugin.name, hook: 'onComplete' });
          } catch {
            // the error reporter itself must not fail the run either
          }
        }
      }

      return value;
    },
  };
}
