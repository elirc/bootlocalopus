/**
 * HISTORICAL — this script has already been run and cannot be run again.
 *
 * One-off migration (v1) of the curriculum from six template-literal track
 * files (`content/<track>/index.ts`) to one folder per lesson with real code
 * files plus typed chapter metadata (`content/<track>/<chapter>/chapter.ts`).
 * The monoliths it read were deleted once it passed; they are in git history
 * at commit 5def3f9. Kept as the record of how the tree was produced and what
 * was proven about it. The format itself is documented in content/AUTHORING.md.
 *
 * What it does:
 *   1. imports the current (monolith) `content/index.ts` and snapshots it;
 *   2. writes the folder tree, every `chapter.ts`, every `track.ts`, and the
 *      new `content/index.ts` — lesson files byte-exact, no added newline;
 *   3. PROVES losslessness, exiting non-zero on any difference:
 *      a. imports the new `content/index.ts` (through `content/load.ts`) and
 *         deep-compares every track, chapter and lesson with the snapshot;
 *      b. independently of the loader, reads every written file and compares
 *         it with the original field, byte for byte;
 *      c. checks the invariants: 72 lessons, 6,785 XP, the kind histogram.
 *
 * Was run once as `npx tsx scripts/migrate-content.ts` (since renamed). Do not rerun.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Lesson, Track } from '../content/types.ts';
import { CODE_EXT, TEST_EXT } from '../content/load.ts';

const ROOT = path.resolve(import.meta.dirname, '..', 'content');
const indexUrl = pathToFileURL(path.join(ROOT, 'index.ts')).href;

/* ------------------------------------------------------------ 1. snapshot */
const before: Track[] = structuredClone((await import(indexUrl)).tracks as Track[]);
const TRACK_VARS = ['jsTrack', 'tsTrack', 'reactTrack', 'nodeTrack', 'sqlTrack', 'craftTrack'];
assert.deepEqual(before.map((t) => t.id), ['js', 'ts', 'react', 'node', 'sql', 'craft']);

/* ------------------------------------------------------ TS literal printer */
const LS_PS = String.fromCharCode(0x2028, 0x2029); // as code points: they are line terminators
const ESC = new RegExp(String.raw`[\\'\x00-\x1f` + LS_PS + ']', 'g');
const str = (s: string) => `'${s.replace(ESC, (c) =>
  ({ '\\': '\\\\', "'": "\\'", '\n': '\\n', '\r': '\\r', '\t': '\\t' } as Record<string, string>)[c]
  ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}'`;
const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : str(k));

function lit(v: unknown, ind: string): string {
  if (typeof v === 'string') return str(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const inner = ind + '  ';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const flat = v.every((x) => typeof x !== 'object') ? `[${v.map((x) => lit(x, inner)).join(', ')}]` : '';
    if (flat && flat.length + ind.length < 100) return flat;
    return `[\n${v.map((x) => `${inner}${lit(x, inner)},\n`).join('')}${ind}]`;
  }
  if (v && typeof v === 'object') {
    const es = Object.entries(v).filter(([, x]) => x !== undefined);
    return `{\n${es.map(([k, x]) => `${inner}${key(k)}: ${lit(x, inner)},\n`).join('')}${ind}}`;
  }
  throw new Error(`cannot print ${String(v)}`);
}

/* ------------------------------------------------------------- 2. write */
const FILE_FIELDS = ['brief', 'starter', 'solution', 'tests', 'fixtures'] as const;
type FileField = (typeof FILE_FIELDS)[number];
const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function filesOf(l: Lesson): [FileField, string][] {
  if (l.kind === 'mutation') throw new Error(`${l.id}: mutation lessons did not exist at v1`);
  const out: [FileField, string][] = [['brief', 'brief.md']];
  if (l.kind === 'quiz') return out;
  const c = CODE_EXT[l.kind], t = TEST_EXT[l.kind];
  out.push(['starter', `starter.${c}`], ['solution', `solution.${c}`], ['tests', `tests.${t}`]);
  if (l.fixtures !== undefined) out.push(['fixtures', 'fixtures.sql']);
  return out;
}

const written: { lesson: Lesson; field: FileField; file: string }[] = [];

for (const track of before) {
  const tdir = path.join(ROOT, track.id);
  const chapterVars: string[] = [];
  const imports: string[] = [];
  for (const chapter of track.chapters) {
    assert.ok(chapter.id.startsWith(`${track.id}-`), `${chapter.id}: no track prefix`);
    const cname = chapter.id.slice(track.id.length + 1);
    const cdir = path.join(tdir, cname);
    rmSync(cdir, { recursive: true, force: true });
    mkdirSync(cdir, { recursive: true });

    const metas = chapter.lessons.map((l) => {
      const ldir = path.join(cdir, l.id);
      mkdirSync(ldir);
      for (const [field, name] of filesOf(l)) {
        const file = path.join(ldir, name);
        writeFileSync(file, l[field]!, 'utf8');
        written.push({ lesson: l, field, file });
      }
      const meta: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(l)) if (!(FILE_FIELDS as readonly string[]).includes(k)) meta[k] = v;
      return meta;
    });

    const { lessons: _l, ...chapterHead } = chapter;
    writeFileSync(path.join(cdir, 'chapter.ts'),
      `import { loadChapter } from '../../load.ts';\n\n` +
      `const here = import.meta.dirname;\n\n` +
      `export default loadChapter(here, ${lit({ ...chapterHead, lessons: metas }, '')});\n`, 'utf8');
    const v = camel(cname);
    chapterVars.push(v);
    imports.push(`import ${v} from './${cname}/chapter.ts';`);
  }
  const { chapters: _c, ...trackHead } = track;
  const body = lit(trackHead, '').replace(/\n}$/, `\n  chapters: [${chapterVars.join(', ')}],\n}`);
  writeFileSync(path.join(tdir, 'track.ts'),
    `import { defineTrack } from '../load.ts';\n${imports.join('\n')}\n\nexport default defineTrack(${body});\n`, 'utf8');
}

writeFileSync(path.join(ROOT, 'index.ts'), `import type { Track } from './types.ts';
${before.map((t, i) => `import ${TRACK_VARS[i]} from './${t.id}/track.ts';`).join('\n')}

/**
 * Track order is the suggested path: language fundamentals, then types, then
 * the two halves of the stack, then data, then the judgement layer.
 *
 * Each track.ts pulls in its chapter.ts files, and each chapter.ts loads its
 * lesson folders through content/load.ts, which validates them as it goes.
 */
export const tracks: Track[] = [${TRACK_VARS.join(', ')}];

const seen = new Map<string, string>();
for (const t of tracks) {
  for (const c of t.chapters) {
    for (const l of c.lessons) {
      const prev = seen.get(l.id);
      if (prev) throw new Error(\`content: duplicate lesson id "\${l.id}" (\${prev} and \${t.id}/\${c.id})\`);
      seen.set(l.id, \`\${t.id}/\${c.id}\`);
    }
  }
}
`, 'utf8');

/* -------------------------------------------------------------- 3. prove */
let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n${String((e as Error).message).slice(0, 3000)}`); }
};

console.log('\nRound-trip proof');
const after: Track[] = (await import(`${indexUrl}?after=${Date.now()}`)).tracks;

check('a. loader output deep-equals the original (tracks, chapters, every lesson field)', () => {
  assert.deepStrictEqual(after, before);
});
check('a. per-lesson deep-equality, reported individually', () => {
  const flat = (ts: Track[]) => ts.flatMap((t) => t.chapters.flatMap((c) => c.lessons));
  const a = new Map(flat(after).map((l) => [l.id, l]));
  const bad = flat(before).filter((l) => {
    try { assert.deepStrictEqual(a.get(l.id), l); return false; } catch { return true; }
  });
  assert.equal(bad.length, 0, `differs: ${bad.map((l) => l.id).join(', ')}`);
});
check(`b. ${written.length} files re-read byte-exact against the original strings`, () => {
  const bad = written.filter((w) => readFileSync(w.file, 'utf8') !== w.lesson[w.field]);
  assert.equal(bad.length, 0, bad.map((w) => `${w.lesson.id}.${w.field}`).join(', '));
});
check('c. invariants: 72 lessons, 6,785 XP, kind histogram', () => {
  const ls = after.flatMap((t) => t.chapters.flatMap((c) => c.lessons));
  assert.equal(ls.length, 72);
  assert.equal(ls.reduce((s, l) => s + l.xp, 0), 6785);
  const hist: Record<string, number> = {};
  for (const l of ls) hist[l.kind] = (hist[l.kind] ?? 0) + 1;
  assert.deepStrictEqual(hist, { js: 15, ts: 2, typecheck: 10, react: 12, node: 11, sql: 12, quiz: 10 });
});
const noNl = written.filter((w) => w.field === 'tests' && !w.lesson.tests!.endsWith('\n')).length;
console.log(`  info  ${noNl} of ${written.filter((w) => w.field === 'tests').length} tests files have no trailing newline (preserved as-is)`);

console.log(failures ? `\n${failures} check(s) FAILED — do not delete the monoliths.` : '\nLossless. Safe to delete content/*/index.ts.');
process.exit(failures ? 1 : 0);
