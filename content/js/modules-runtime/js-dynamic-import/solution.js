export class PluginLoadError extends Error {
  constructor(specifier, message, options) {
    super(message, options);
    this.name = 'PluginLoadError';
    this.specifier = specifier;
  }
}

const isValidPlugin = (plugin) =>
  plugin != null && typeof plugin.name === 'string' && plugin.name !== '' && typeof plugin.setup === 'function';

async function loadOne(specifier, importModule) {
  let mod;
  try {
    mod = await importModule(specifier);
  } catch (cause) {
    throw new PluginLoadError(specifier, `Could not load plugin "${specifier}"`, { cause });
  }
  // `export default {...}` and CommonJS land on `default`; named exports do not.
  const plugin = mod.default !== undefined ? mod.default : mod;
  if (!isValidPlugin(plugin)) {
    throw new PluginLoadError(specifier, `Plugin "${specifier}" must export a name and a setup function`);
  }
  return plugin;
}

export async function loadPlugins(specifiers, { importModule = (s) => import(s) } = {}) {
  // Start everything at once, but report results in the order we were given.
  const results = await Promise.allSettled(specifiers.map((s) => loadOne(s, importModule)));

  const plugins = [];
  const seen = new Set();
  for (const [i, result] of results.entries()) {
    if (result.status === 'rejected') throw result.reason;
    const plugin = result.value;
    if (seen.has(plugin.name)) {
      throw new PluginLoadError(specifiers[i], `Duplicate plugin name "${plugin.name}"`);
    }
    seen.add(plugin.name);
    plugins.push(plugin);
  }
  return plugins;
}

export function lazy(loader) {
  let pending = null;
  return function load() {
    if (!pending) {
      // new Promise() turns a synchronous throw into a rejection.
      pending = new Promise((resolve) => resolve(loader()));
      // Forget a failure so the next call retries, instead of failing forever.
      pending.catch(() => {
        pending = null;
      });
    }
    return pending;
  };
}
