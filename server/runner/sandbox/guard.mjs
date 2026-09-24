/**
 * Narrowing what graded code can reach. Installed after the environment has
 * loaded its own dependencies (jsdom needs `node:vm` at load) and before any
 * learner module is imported.
 *
 * None of this is a security boundary: the code still runs in this thread,
 * with `fs` and `net` (the node track needs them). It removes the one-line
 * routes to ending the run, reaching the result channel, or loading files
 * outside the run dir.
 */
import module from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as P from './primordials.mjs';

/** Thrown by the neutered `process.exit`; the worker reports it as phase `exit`. */
export class SandboxExit extends Error {
  #brand = true;
  constructor(message) {
    super(message);
    this.name = 'Error';
    this.code = 'ERR_SANDBOX_EXIT';
  }
  static is(e) {
    return e !== null && typeof e === 'object' && #brand in e;
  }
}

const PROCESS_DENY = ['exit', 'kill', 'abort', 'chdir', 'dlopen', 'reallyExit', 'binding', '_linkedBinding', 'getBuiltinModule'];

export function lockProcess() {
  for (const k of PROCESS_DENY) {
    const value = k === 'exit' || k === 'reallyExit'
      ? function exit() { throw new SandboxExit(`process.${k}() is not available in graded code`); }
      : function denied() { throw new Error(`process.${k}() is not available in graded code`); };
    try {
      P.ObjectDefineProperty(process, k, { value, writable: false, configurable: false, enumerable: false });
    } catch { /* already locked */ }
  }
}

const BUILTIN_DENY = new Set([
  'child_process', 'cluster', 'worker_threads', 'vm', 'inspector', 'inspector/promises', 'v8', 'repl', 'module',
]);

const norm = (s) => (process.platform === 'win32' ? P.StringPrototypeToLowerCase(s) : s);
const dirUrl = (dir) => norm(pathToFileURL(dir.endsWith(path.sep) ? dir : dir + path.sep).href);

/**
 * Resolve hook: builtins on the deny list and `file:` URLs outside the run
 * dir and the project's node_modules throw at import time. Applies to
 * `import`, `import()` and `require()` alike.
 */
export function installImportPolicy({ runDir, projectRoot }) {
  const allowed = [dirUrl(runDir), dirUrl(path.join(projectRoot, 'node_modules'))];
  module.registerHooks({
    resolve(specifier, context, nextResolve) {
      const r = nextResolve(specifier, context);
      const url = String(r && r.url);
      if (P.StringPrototypeStartsWith(url, 'node:')) {
        if (BUILTIN_DENY.has(P.StringPrototypeSlice(url, 5))) {
          throw new Error(`import of '${specifier}' is not available in graded code`);
        }
        return r;
      }
      if (P.StringPrototypeStartsWith(url, 'file:')) {
        const u = norm(url);
        if (!P.ArrayPrototypeSome(allowed, (prefix) => P.StringPrototypeStartsWith(u, prefix))) {
          throw new Error(`import of '${specifier}' is not available in graded code (only files in the run and node_modules can be loaded)`);
        }
      }
      return r;
    },
  });
}

/** Define globals that graded code cannot reassign, redefine or delete. */
export function defineLocked(target, entries) {
  for (const [name, value] of P.ObjectEntries(entries)) {
    P.ObjectDefineProperty(target, name, { value, writable: false, configurable: false, enumerable: true });
  }
}

/** A locked global whose value is read through `get` (so the harness can repoint it). */
export function defineLockedAccessor(target, name, get, set) {
  P.ObjectDefineProperty(target, name, { get, set, configurable: false, enumerable: true });
}
