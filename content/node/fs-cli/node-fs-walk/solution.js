import { readdir } from 'node:fs/promises';
import path from 'node:path';

export async function* walk(root, { ignore = [], extensions } = {}) {
  const skip = new Set(ignore);
  const wanted = extensions ? new Set(extensions.map((e) => e.toLowerCase())) : null;

  // `rel` is the '/'-joined path from root ('' for root itself).
  async function* visit(dir, rel) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      // A link (or junction) could point anywhere, including back up the tree.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        yield* visit(path.join(dir, entry.name), childRel);
      } else if (entry.isFile()) {
        if (wanted && !wanted.has(path.extname(entry.name).toLowerCase())) continue;
        yield childRel;
      }
    }
  }

  yield* visit(root, '');
}
