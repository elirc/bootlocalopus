/**
 * TypeScript/JSX to plain ESM, and writing the result into the run dir so
 * `import()` can load it (and resolve `react` against the project's
 * node_modules).
 */
import { writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export function transpile(source, fileName, { jsx = false } = {}) {
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    esModuleInterop: true,
    allowJs: true,
    useDefineForClassFields: false,
  };
  // `jsx` must be omitted entirely for non-JSX input; passing JsxEmit.None is
  // rejected by tsc as an invalid option value.
  if (jsx) compilerOptions.jsx = ts.JsxEmit.ReactJSX;
  const out = ts.transpileModule(String(source ?? ''), { fileName, reportDiagnostics: true, compilerOptions });
  const errors = (out.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    const d = errors[0];
    const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : null;
    const where = pos ? ' (line ' + (pos.line + 1) + ')' : '';
    throw new SyntaxError(ts.flattenDiagnosticMessageText(d.messageText, ' ') + where);
  }
  return out.outputText;
}

/** Write `source` as `<dir>/<name>` and return its file: URL. */
export async function emit(dir, name, source) {
  const file = path.join(dir, name);
  await writeFile(file, source, 'utf8');
  return pathToFileURL(file).href;
}

/** Remove an emitted file once it has been imported, so graded code cannot read it back from disk. */
export async function unemit(url) {
  try {
    await unlink(new URL(url));
  } catch { /* already gone, or Windows still holds it: the run dir is removed afterwards anyway */ }
}
