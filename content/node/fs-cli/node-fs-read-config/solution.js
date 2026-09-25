import { readFile } from 'node:fs/promises';

export class ConfigError extends Error {
  constructor(message, { path, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ConfigError';
    this.path = path;
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export async function loadConfig(filePath, defaults) {
  let text;
  try {
    // No existsSync first: that check can be stale by the time we read.
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { ...defaults };
    throw error; // EISDIR, EACCES, EMFILE… are real problems: never hide them.
  }

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new ConfigError(`invalid JSON in ${filePath}: ${cause.message}`, { path: filePath, cause });
  }
  if (!isPlainObject(parsed)) {
    throw new ConfigError(`${filePath} must contain a JSON object`, { path: filePath });
  }
  return { ...defaults, ...parsed };
}
