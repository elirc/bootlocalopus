import { readdir } from 'node:fs/promises';
import path from 'node:path';

export async function* walk(root, { ignore = [], extensions } = {}) {
  // TODO: read each directory with { withFileTypes: true }, recurse into
  // subdirectories you are not ignoring, and yield files as root-relative,
  // '/'-separated paths.
  throw new Error('walk is not implemented yet');
}
