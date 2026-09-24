/**
 * Points git at the repo's hooks: `git config core.hooksPath .githooks`.
 *
 * Runs from `npm install` through the `prepare` script, and must never fail
 * the install: no git on PATH, a zip download without `.git`, and CI all just
 * skip. A hooksPath the developer already set to something else is left alone.
 *
 *   node scripts/setup-hooks.mjs          (or: npm run prepare)
 *   SKIP_GIT_HOOKS=1 npm install           to opt out
 *
 * To undo: git config --unset core.hooksPath
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const say = (msg) => console.log(`setup-hooks: ${msg}`);

function main() {
  if (process.env.CI || process.env.SKIP_GIT_HOOKS) return say('skipped (CI or SKIP_GIT_HOOKS)');
  if (!existsSync(path.join(root, '.git'))) return say('skipped (not a git checkout)');
  if (!existsSync(path.join(root, '.githooks'))) return say('skipped (no .githooks directory)');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let current = '';
  try {
    current = git('config', '--get', 'core.hooksPath');
  } catch {
    // `git config --get` exits 1 when unset; a missing git binary also lands here and fails below.
  }
  if (current && current !== '.githooks') return say(`left alone: core.hooksPath is already "${current}"`);
  git('config', 'core.hooksPath', '.githooks');
  say('core.hooksPath = .githooks (pre-commit: typecheck + verify --changed)');
}

try {
  main();
} catch (e) {
  say(`skipped (${e.code === 'ENOENT' ? 'git not found on PATH' : e.message.split('\n')[0]})`);
}
