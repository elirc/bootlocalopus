import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function moduleFile(metaUrl) {
  // TODO: the old __filename
  throw new Error('moduleFile: not implemented');
}

export function moduleDir(metaUrl) {
  // TODO: the old __dirname
  throw new Error('moduleDir: not implemented');
}

export function resolveFrom(metaUrl, relativePath) {
  // TODO: relative to the module, not to process.cwd()
  throw new Error('resolveFrom: not implemented');
}

export function toImportSpecifier(filePath) {
  // TODO: something import() accepts on every OS
  throw new Error('toImportSpecifier: not implemented');
}

export function isEntrypoint(metaUrl, argv1 = process.argv[1]) {
  // TODO: the ESM version of require.main === module
  throw new Error('isEntrypoint: not implemented');
}
