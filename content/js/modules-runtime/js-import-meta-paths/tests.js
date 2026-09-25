import path from 'node:path';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { moduleFile, moduleDir, resolveFrom, toImportSpecifier, isEntrypoint } = solution;

// A project in a folder with a space, a '#' and a '%' in its name.
const root = path.resolve(path.sep, 'srv', 'acme app', 'svc #2 100%');
const file = path.join(root, 'src', 'server.js');
const metaUrl = pathToFileURL(file).href;

describe('moduleFile / moduleDir', () => {
  it('decode the URL into a real path', () => {
    expect(metaUrl).toContain('%20'); // what .pathname would leave in
    expect(moduleFile(metaUrl)).toBe(file);
    expect(moduleDir(metaUrl)).toBe(path.join(root, 'src'));
  });

  it('work on a real import.meta.url', () => {
    const here = moduleFile(import.meta.url);
    expect(path.isAbsolute(here)).toBe(true);
    expect(existsSync(here)).toBe(true);
    expect(moduleDir(import.meta.url)).toBe(path.dirname(here));
  });
});

describe('resolveFrom', () => {
  it('resolves against the module directory, not the working directory', () => {
    expect(resolveFrom(metaUrl, './config/app.json')).toBe(path.join(root, 'src', 'config', 'app.json'));
    expect(resolveFrom(metaUrl, 'templates/x/../email.html')).toBe(path.join(root, 'src', 'templates', 'email.html'));
  });

  it('handles ../ and file names with #, ? and %', () => {
    expect(resolveFrom(metaUrl, '../data/seed #1.json')).toBe(path.join(root, 'data', 'seed #1.json'));
    expect(resolveFrom(metaUrl, '../data/what?.txt')).toBe(path.join(root, 'data', 'what?.txt'));
    expect(resolveFrom(metaUrl, '../data/50% off.csv')).toBe(path.join(root, 'data', '50% off.csv'));
  });

  it('returns an absolute path unchanged (normalised)', () => {
    const elsewhere = path.resolve(path.sep, 'etc', 'shared', 'keys.pem');
    expect(resolveFrom(metaUrl, elsewhere)).toBe(elsewhere);
  });
});

describe('toImportSpecifier', () => {
  it('gives a file: URL that round-trips to the same path', () => {
    const spec = toImportSpecifier(file);
    expect(spec.startsWith('file:')).toBe(true);
    expect(fileURLToPath(spec)).toBe(file);
  });

  it('can actually be imported, even with # and % in the name', async () => {
    const runDir = path.dirname(fileURLToPath(import.meta.url));
    const plugin = path.join(runDir, 'plugin #1 50%.mjs');
    writeFileSync(plugin, 'export const answer = 42;\n');
    const mod = await import(toImportSpecifier(plugin));
    expect(mod.answer).toBe(42);
  });
});

describe('isEntrypoint', () => {
  it('is true for the script node was started with', () => {
    expect(isEntrypoint(metaUrl, file)).toBe(true);
  });

  it('accepts a relative argv[1] and a missing extension', () => {
    expect(isEntrypoint(metaUrl, path.relative(process.cwd(), file))).toBe(true);
    expect(isEntrypoint(metaUrl, path.join(root, 'src', 'server'))).toBe(true);
  });

  it('is false for other scripts, including prefixes and namesakes', () => {
    expect(isEntrypoint(metaUrl, path.join(root, 'src', 'worker.js'))).toBe(false);
    expect(isEntrypoint(metaUrl, path.join(root, 'src', 'serve'))).toBe(false);
    expect(isEntrypoint(metaUrl, path.join(root, 'lib', 'server.js'))).toBe(false);
    expect(isEntrypoint(metaUrl, file + '.bak')).toBe(false);
  });

  it('is false without an argv[1], and for a module that is not the entry', () => {
    expect(isEntrypoint(metaUrl, '')).toBe(false);
    expect(isEntrypoint(import.meta.url)).toBe(false);
  });
});
