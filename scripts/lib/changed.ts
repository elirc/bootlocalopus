/**
 * Which lessons does a set of changed files touch?
 *
 * The content tree is `content/<track>/<chapter>/<lesson-id>/…`, so the
 * mapping is by path:
 *   - a file inside a lesson folder            -> that lesson
 *   - `content/<track>/<chapter>/chapter.ts`   -> every lesson in that chapter
 *   - any file directly in `content/<track>/`  -> every lesson in that track
 *   - `content/*.ts`, the sandbox (`server/runner/**`) or the lockfile
 *                                               -> everything
 * Anything else (docs, the web UI, the rest of the server) selects nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `git diff --name-only HEAD` plus untracked files, as forward-slash repo paths. Throws when git is unavailable. */
export function gitChangedFiles(): string[] {
  const run = (args: string[]) =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  let tracked: string[];
  try {
    tracked = run(['diff', '--name-only', 'HEAD']);
  } catch {
    // No HEAD yet (fresh repo): everything staged counts.
    tracked = run(['diff', '--name-only', '--cached']);
  }
  const untracked = run(['ls-files', '--others', '--exclude-standard']);
  return [...new Set([...tracked, ...untracked])].map((f) => f.replace(/\\/g, '/'));
}

const GLOBAL = [/^content\/[^/]+\.ts$/, /^server\/runner\//, /^package-lock\.json$/];

export interface Selection {
  /** Every lesson is affected. */
  all: boolean;
  ids: Set<string>;
  /** Why each id (or `*`) was selected: the first file that selected it. */
  reasons: Map<string, string>;
}

/**
 * @param known every current lesson id. Lessons are discovered from the
 *   folders on disk; only ids in `known` count, so a deleted lesson's path
 *   selects nothing.
 */
export function lessonsForFiles(files: string[], known: Set<string>): Selection {
  const sel: Selection = { all: false, ids: new Set(), reasons: new Map() };
  const add = (id: string, why: string) => {
    if (!known.has(id) || sel.ids.has(id)) return;
    sel.ids.add(id);
    sel.reasons.set(id, why);
  };
  const lessonDirs = (dir: string): string[] => {
    const abs = path.join(repoRoot, dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  };

  for (const raw of files) {
    const file = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    if (GLOBAL.some((re) => re.test(file))) {
      sel.all = true;
      if (!sel.reasons.has('*')) sel.reasons.set('*', file);
      continue;
    }
    const parts = file.split('/');
    if (parts[0] !== 'content' || parts.length < 3) continue;
    const [, track, chapter, lesson] = parts;
    if (parts.length === 3) {
      // content/<track>/<file>: the whole track.
      for (const ch of lessonDirs(`content/${track}`)) for (const id of lessonDirs(`content/${track}/${ch}`)) add(id, file);
    } else if (parts.length === 4) {
      // content/<track>/<chapter>/<file> (chapter.ts): the whole chapter.
      for (const id of lessonDirs(`content/${track}/${chapter}`)) add(id, file);
    } else {
      add(lesson, file);
    }
  }
  if (sel.all) for (const id of known) sel.ids.add(id);
  return sel;
}
