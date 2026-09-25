import { readdir, readFile, copyFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export async function planSync(srcDir, destDir, { deleteExtra = false } = {}) {
  // TODO: list both trees, compare, and return a sorted plan. Touch nothing.
  throw new Error('planSync is not implemented yet');
}

export async function applySync(srcDir, destDir, plan) {
  // TODO: carry out each { action, path } entry.
  throw new Error('applySync is not implemented yet');
}
