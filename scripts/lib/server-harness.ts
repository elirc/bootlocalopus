/**
 * Start a real API server in a child process on a free port with a throwaway
 * data directory, so the e2e and UI suites are hermetic: they never touch the
 * learner's save file and never depend on a server already running.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface TestServer {
  base: string;
  port: number;
  dataDir: string;
  stop(): Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

export async function startServer(opts: { prod?: boolean; env?: Record<string, string> } = {}): Promise<TestServer> {
  const port = await freePort();
  const dataDir = await mkdtemp(path.join(tmpdir(), 'bootlocalopus-test-'));
  const args = ['--import', 'tsx', path.join(root, 'server', 'index.ts'), ...(opts.prod ? ['--prod'] : [])];

  const child: ChildProcess = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let output = '';
  child.stdout?.on('data', (d) => { output += d; });
  child.stderr?.on('data', (d) => { output += d; });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${output}`);
    try {
      const res = await fetch(base + '/api/health');
      if (res.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (child.exitCode !== null) throw new Error(`server exited early:\n${output}`);

  return {
    base,
    port,
    dataDir,
    async stop() {
      if (child.exitCode === null) {
        child.kill();
        await new Promise<void>((resolve) => {
          child.once('exit', () => resolve());
          setTimeout(resolve, 3_000);
        });
      }
      await rm(dataDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/** Tiny check helper shared by the suites. */
export function makeChecker() {
  let failures = 0;
  const check = (label: string, condition: boolean, detail?: unknown) => {
    console.log(`${condition ? '  ✓' : '  ✗'} ${label}`);
    if (!condition) {
      failures++;
      if (detail !== undefined) {
        const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
        console.log('      got:', text?.slice(0, 500));
      }
    }
  };
  return { check, failures: () => failures };
}
