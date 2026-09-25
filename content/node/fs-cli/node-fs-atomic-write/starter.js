import { writeFile, rename, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export async function writeFileAtomic(filePath, data) {
  // TODO: write to a uniquely named temp file next to filePath, then rename it
  // over filePath. Clean up the temp file on failure.
  throw new Error('writeFileAtomic is not implemented yet');
}
