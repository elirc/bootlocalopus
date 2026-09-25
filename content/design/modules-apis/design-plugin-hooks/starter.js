export class PluginError extends Error {}

export class ValidationError extends Error {}

export function createPipeline({ plugins = [], onPluginError = () => {} } = {}) {
  return {
    names: () => plugins.map((p) => p.name),

    async run(input) {
      // TODO: transform (waterfall) -> validate (bail) -> onComplete (notify)
      throw new Error('TODO');
    },
  };
}
