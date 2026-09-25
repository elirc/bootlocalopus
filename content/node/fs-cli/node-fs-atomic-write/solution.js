import { open, rename, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export async function writeFileAtomic(filePath, data) {
  // Same directory as the target, so the rename never crosses a filesystem.
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`);

  let handle;
  try {
    handle = await open(tmp, 'wx'); // 'wx': fail rather than reuse an existing file
    await handle.writeFile(data);
    await handle.sync(); // durable before it becomes visible
    await handle.close();
    handle = undefined;
    await rename(tmp, filePath);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}
