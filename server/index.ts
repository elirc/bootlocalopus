/**
 * Process entry point: take the save-file lock, sweep sandbox debris, bind to
 * loopback only, and serve the built UI in production.
 */
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import * as store from './progress.ts';
import { createApp } from './app.ts';
import { runExercise, sweepRunsDir } from './runner/index.ts';
import { totalLessons, totalXp, tracks } from './content.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PROD = process.argv.includes('--prod');
const PORT = Number(process.env.PORT ?? 4517);
const HOST = '127.0.0.1';

await store.acquireLock();
void sweepRunsDir();

const app = createApp({ store, runner: { run: runExercise } });

if (PROD) {
  const dist = path.join(root, 'dist');
  if (!existsSync(dist)) {
    console.error('No build found. Run `npm run build` first, or use `npm run dev`.');
    process.exit(1);
  }
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = app.listen(PORT, HOST, () => {
  const label = PROD ? `http://${HOST}:${PORT}` : `API on http://${HOST}:${PORT} (UI on the Vite port)`;
  console.log(
    `\n  🎮  bootlocalopus — ${totalLessons} lessons, ${totalXp.toLocaleString()} XP across ${tracks.length} tracks\n` +
    `      ${label}\n      save file: ${store.DATA_DIR}\n`,
  );
});

// Let an in-flight grade finish, then flush the save, then exit.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      store.save().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
