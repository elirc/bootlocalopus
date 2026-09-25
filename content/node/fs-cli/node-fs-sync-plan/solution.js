import { readdir, readFile, copyFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

/** Map of '/'-joined relative path -> absolute path, for every regular file under dir. */
async function listFiles(dir, rel = '', out = new Map()) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) await listFiles(abs, childRel, out);
    else if (entry.isFile()) out.set(childRel, abs);
  }
  return out;
}

async function listOrEmpty(dir) {
  try {
    return await listFiles(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

async function sameContent(a, b) {
  const [sa, sb] = await Promise.all([stat(a), stat(b)]);
  if (sa.size !== sb.size) return false; // cheap check first
  const [ba, bb] = await Promise.all([readFile(a), readFile(b)]);
  return ba.equals(bb);
}

export async function planSync(srcDir, destDir, { deleteExtra = false } = {}) {
  const src = await listFiles(srcDir);
  const dest = await listOrEmpty(destDir);
  const plan = [];

  for (const [rel, abs] of src) {
    if (!dest.has(rel)) plan.push({ action: 'copy', path: rel });
    else if (!(await sameContent(abs, dest.get(rel)))) plan.push({ action: 'update', path: rel });
  }
  if (deleteExtra) {
    for (const rel of dest.keys()) {
      if (!src.has(rel)) plan.push({ action: 'delete', path: rel });
    }
  }
  return plan.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export async function applySync(srcDir, destDir, plan) {
  for (const { action, path: rel } of plan) {
    const parts = rel.split('/');
    const target = path.join(destDir, ...parts);
    if (action === 'delete') {
      await rm(target, { force: true });
    } else {
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(srcDir, ...parts), target);
    }
  }
}
