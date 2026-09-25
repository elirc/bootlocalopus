export class PluginLoadError extends Error {
  // TODO: name, specifier, and pass { cause } through to Error
}

export async function loadPlugins(specifiers, { importModule = (s) => import(s) } = {}) {
  // TODO: import in parallel, validate, report in the order given
  throw new Error('loadPlugins: not implemented');
}

export function lazy(loader) {
  // TODO: cache the promise, but not a rejected one
  return () => Promise.reject(new Error('lazy: not implemented'));
}
