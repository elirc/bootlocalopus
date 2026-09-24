import { inspect } from 'node:util';

export class Secret {
  constructor(value) {
    // TODO: this is readable by anything that prints the object. Use a #private field.
    this.value = value;
  }

  reveal() {
    return this.value;
  }

  // TODO: toJSON, toString and [inspect.custom] should all show '[REDACTED]'.
}

export class ConfigError extends Error {
  constructor(problems) {
    super('invalid config: ' + problems.join('; '));
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

export function loadConfig(env) {
  // TODO: validate every variable in the brief's table, collect ALL problems,
  // throw one ConfigError if there are any, and return a frozen config.
  throw new Error('loadConfig() is not implemented yet');
}
