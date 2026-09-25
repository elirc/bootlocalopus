import { readFile } from 'node:fs/promises';

export class ConfigError extends Error {
  // TODO: name, path, cause
}

export async function loadConfig(filePath, defaults) {
  // TODO: read the file, treat ENOENT as "use the defaults",
  // and turn bad JSON into a ConfigError. Let every other error through.
  throw new Error('loadConfig is not implemented yet');
}
