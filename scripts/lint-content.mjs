/**
 * Content files mix three quoting worlds — TS single-quoted strings, TS
 * template literals holding markdown, and template literals holding JS/SQL
 * source. The escaping rules differ in each, and a mistake shows up as one
 * inscrutable esbuild error a thousand lines away.
 *
 * This normalises them:
 *
 *  - inside a template literal: escape a raw backtick or `${` that would
 *    terminate the literal or start an interpolation
 * A small scanner tracks which world each character is in, so a backtick that
 * is a delimiter in one is left alone in the other. Quoted strings are only
 * skipped over, never rewritten.
 *
 *   node scripts/lint-content.mjs [--check] <files...>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const files = args.filter((a) => !a.startsWith('--'));

/** A backtick closes a template literal only if the rest of its line is blank/punctuation. */
const closesTemplate = (src, i) => {
  for (let j = i + 1; j < src.length && src[j] !== '\n'; j++) {
    if (!' \t,;)'.includes(src[j])) return false;
  }
  return true;
};

let total = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const fixes = [];
  let out = '';
  let i = 0;
  const lineOf = (index) => src.slice(0, index).split('\n').length;

  while (i < src.length) {
    const ch = src[i];

    // ---- comments: nothing inside them can break a string
    if (ch === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) {
      const end = src[i + 1] === '/'
        ? (src.indexOf('\n', i) === -1 ? src.length : src.indexOf('\n', i))
        : (src.indexOf('*/', i) === -1 ? src.length : src.indexOf('*/', i) + 2);
      out += src.slice(i, end);
      i = end;
      continue;
    }

    // ---- template literal
    if (ch === '`') {
      out += ch;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (src[i] === '`') {
          if (closesTemplate(src, i)) break;
          fixes.push({ line: lineOf(i), what: 'raw backtick in template' });
          out += '\\`';
          i++;
          continue;
        }
        if (src[i] === '$' && src[i + 1] === '{') {
          fixes.push({ line: lineOf(i), what: 'interpolation in template' });
          out += '\\${';
          i += 2;
          continue;
        }
        out += src[i++];
      }
      out += src[i] ?? '';   // the closing backtick
      i++;
      continue;
    }

    // Quoted strings are skipped wholesale: whether a quote closes the string
    // or is an apostrophe in prose cannot be decided reliably here, and esbuild
    // reports a genuinely unterminated string accurately anyway.
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const NEWLINE = String.fromCharCode(10);
      const BACKSLASH = String.fromCharCode(92);
      out += ch;
      i++;
      while (i < src.length && src[i] !== NEWLINE) {
        if (src[i] === BACKSLASH) {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (src[i] === quote) break;
        out += src[i++];
      }
      out += src[i] ?? '';
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  if (fixes.length) {
    total += fixes.length;
    const grouped = fixes.map((f) => `line ${f.line} (${f.what})`).join(', ');
    console.log(`${checkOnly ? 'WOULD FIX' : 'fixed'} ${fixes.length} in ${file}: ${grouped}`);
    if (!checkOnly) writeFileSync(file, out, 'utf8');
  }
}

if (!total) console.log('No unescaped backticks or interpolations inside template literals.');
process.exit(checkOnly && total ? 1 : 0);
