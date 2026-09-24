/**
 * `typecheck` lessons: real `tsc --strict` over the learner's file plus the
 * lesson's type-level spec. Zero diagnostics is the pass condition.
 *
 * The program is deliberately small: `types: []` and the ES2022 lib only
 * (no @types/node, no DOM), which is ~59 files instead of ~194. A lesson that
 * genuinely needs ambient Node or DOM types opts in via `ambient` — expensive
 * (+105 files for node).
 *
 * No learner code executes here; the files are only type-checked.
 */
import path from 'node:path';
import ts from 'typescript';

const TYPE_HELPERS = [
  'type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;',
  'type Expect<T extends true> = T;',
  'type ExpectFalse<T extends false> = T;',
  'type IsAny<T> = 0 extends 1 & T ? true : false;',
].join('\n');

/** Step 1 (environment): build the program. The caller posts `ready` after this. */
export function createTypecheckProgram({ code, tests, dir, ambient = [] }) {
  const solPath = path.join(dir, 'solution.ts');
  const specPath = path.join(dir, 'spec.ts');
  const files = new Map([
    [solPath, String(code ?? '')],
    [specPath, TYPE_HELPERS + '\n' + (tests || '')],
  ]);
  const same = (a, b) => path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
  const lookup = (f) => {
    for (const [p, src] of files) if (same(p, f)) return src;
    return undefined;
  };

  const lib = ['lib.es2022.d.ts'];
  if (ambient.includes('dom')) lib.push('lib.dom.d.ts', 'lib.dom.iterable.d.ts');
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: false,
    types: ambient.includes('node') ? ['node'] : [],
    lib,
  };
  const host = ts.createCompilerHost(options, true);
  const origGetSource = host.getSourceFile.bind(host);
  const origFileExists = host.fileExists.bind(host);
  const origReadFile = host.readFile.bind(host);
  host.getSourceFile = (fileName, langVersion, onError, shouldCreate) => {
    const src = lookup(fileName);
    return src !== undefined
      ? ts.createSourceFile(fileName, src, langVersion, true)
      : origGetSource(fileName, langVersion, onError, shouldCreate);
  };
  host.fileExists = (f) => lookup(f) !== undefined || origFileExists(f);
  host.readFile = (f) => {
    const src = lookup(f);
    return src !== undefined ? src : origReadFile(f);
  };

  const program = ts.createProgram([solPath, specPath], options, host);
  return { program, solPath, hasSpec: !!tests };
}

const SUPPRESSION = /^\/\/\s*@ts-(nocheck|ignore|expect-error)\b|^\/\*+\s*@ts-(nocheck|ignore|expect-error)\b/;
const REFERENCE = /^\/\/\/\s*<reference\b/;

/** Comments in the learner's file that switch the checker off or widen the program. */
function forbiddenComments(sf) {
  const rows = [];
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, sf.languageVariant, sf.text);
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind !== ts.SyntaxKind.SingleLineCommentTrivia && kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const text = scanner.getTokenText();
    const line = sf.getLineAndCharacterOfPosition(scanner.getTokenStart ? scanner.getTokenStart() : scanner.getTokenPos()).line + 1;
    const m = SUPPRESSION.exec(text);
    if (m) {
      rows.push({
        name: `@ts-${m[1] || m[2]} in solution:${line}`,
        passed: false,
        error: `\`@ts-${m[1] || m[2]}\` switches the type checker off, so it is not allowed in a graded file. Fix the type instead.`,
      });
    } else if (REFERENCE.test(text)) {
      rows.push({
        name: `/// <reference> in solution:${line}`,
        passed: false,
        error: 'Triple-slash reference directives are not allowed in a graded file.',
      });
    }
  }
  return rows;
}

/** Opt-in bans: `as` casts (other than `as const`) and the `any` type. */
function forbiddenSyntax(sf, forbid) {
  const rows = [];
  const visit = (node) => {
    const line = () => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (forbid.includes('as')) {
      const isConst = ts.isAsExpression(node) && ts.isTypeReferenceNode(node.type) &&
        ts.isIdentifier(node.type.typeName) && node.type.typeName.text === 'const';
      if ((ts.isAsExpression(node) && !isConst) || ts.isTypeAssertionExpression(node)) {
        rows.push({ name: `type assertion in solution:${line()}`, passed: false, error: 'This lesson is about getting the types right without `as` casts.' });
      }
    }
    if (forbid.includes('any') && node.kind === ts.SyntaxKind.AnyKeyword) {
      rows.push({ name: `any in solution:${line()}`, passed: false, error: 'This lesson is about getting the types right without `any`.' });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return rows;
}

/** Step 2 (grading): diagnostics and the learner-file checks, as test rows. */
export function typecheckRows({ program, solPath, hasSpec }, { forbid = [] } = {}) {
  const errorsOnly = (list) => list.filter((d) => d.category === ts.DiagnosticCategory.Error);
  const diags = errorsOnly([
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ]);

  const sf = program.getSourceFile(solPath);
  const policy = sf ? [...forbiddenComments(sf), ...forbiddenSyntax(sf, forbid)] : [];

  if (!diags.length && !policy.length) {
    const out = [{ name: 'tsc --strict reports no errors', passed: true }];
    if (hasSpec) out.push({ name: 'type-level assertions hold', passed: true });
    return out;
  }
  return [
    ...policy,
    ...diags.slice(0, 10).map((d) => {
      const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : null;
      const where = d.file ? path.basename(d.file.fileName).replace('.ts', '') : 'compiler options';
      return {
        name: 'TS' + d.code + ' in ' + where + (pos ? ':' + (pos.line + 1) : ''),
        passed: false,
        error: ts.flattenDiagnosticMessageText(d.messageText, '\n  '),
      };
    }),
  ];
}
