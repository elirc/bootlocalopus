import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function moduleFile(metaUrl) {
  // Decodes %20 and %23, and drops the leading slash before a Windows drive.
  return fileURLToPath(metaUrl);
}

export function moduleDir(metaUrl) {
  return path.dirname(moduleFile(metaUrl));
}

export function resolveFrom(metaUrl, relativePath) {
  // Path work, not URL work: '#' and '?' are ordinary characters in a file name.
  return path.resolve(moduleDir(metaUrl), relativePath);
}

export function toImportSpecifier(filePath) {
  return pathToFileURL(path.resolve(filePath)).href;
}

export function isEntrypoint(metaUrl, argv1 = process.argv[1]) {
  if (typeof argv1 !== 'string' || argv1 === '') return false;
  const self = moduleFile(metaUrl);
  const script = path.resolve(argv1);
  if (script === self) return true;
  // `node server` runs server.js: compare against the path without its extension.
  const ext = path.extname(self);
  return ext !== '' && script === self.slice(0, -ext.length);
}
