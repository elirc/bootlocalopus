import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

// os.tmpdir() reads TEMP/TMP, which a bare sandbox environment may not have.
const tmpBase = () => {
  try { fs.accessSync(os.tmpdir()); return os.tmpdir(); } catch { return path.dirname(fileURLToPath(import.meta.url)); }
};
const base = fs.realpathSync(fs.mkdtempSync(path.join(tmpBase(), 'traversal-')));
const root = path.join(base, 'files');
fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
fs.mkdirSync(path.join(base, 'files-secret'));
fs.writeFileSync(path.join(root, 'a.txt'), 'hello a');
fs.writeFileSync(path.join(root, 'sub', 'b.txt'), 'hello b');
fs.writeFileSync(path.join(root, '..notes.txt'), 'dots are fine');
fs.writeFileSync(path.join(root, '%2e%2e%2fsecret.txt'), 'a literal name');
fs.writeFileSync(path.join(base, 'secret.txt'), 'TOP SECRET');
fs.writeFileSync(path.join(base, 'files-secret', 'key.pem'), 'PRIVATE KEY');
let linked = false;
try {
  // 'junction' works without admin rights on Windows and is ignored elsewhere.
  fs.symlinkSync(path.join(base, 'files-secret'), path.join(root, 'link'), 'junction');
  linked = true;
} catch {}

const r = (p) => solution.resolveSafe(root, p);

describe('resolveSafe', () => {
  it('resolves ordinary paths inside the root', () => {
    expect(r('a.txt')).toBe(path.join(root, 'a.txt'));
    expect(r('sub/b.txt')).toBe(path.join(root, 'sub', 'b.txt'));
    expect(r('sub%2Fb.txt')).toBe(path.join(root, 'sub', 'b.txt'));
    expect(r('sub/../a.txt')).toBe(path.join(root, 'a.txt'));
    expect(r('my%20file.txt')).toBe(path.join(root, 'my file.txt'));
  });

  it('rejects plain and encoded traversal', () => {
    for (const p of ['../secret.txt', '..%2fsecret.txt', '..%2Fsecret.txt', '%2e%2e/secret.txt', '%2e%2e%2fsecret.txt', 'sub/../../secret.txt', 'sub/%2e%2e/%2e%2e/secret.txt', '..', '../', '../../../../etc/passwd']) {
      expect(r(p)).toBeNull();
    }
  });

  it('rejects a sibling directory that shares the root as a prefix', () => {
    expect(r('../files-secret/key.pem')).toBeNull();
    expect(r('..%2ffiles-secret%2fkey.pem')).toBeNull();
  });

  it('decodes exactly once', () => {
    expect(r('%252e%252e%252fsecret.txt')).toBe(path.join(root, '%2e%2e%2fsecret.txt'));
  });

  it('rejects absolute paths instead of re-rooting them', () => {
    expect(r(encodeURIComponent(path.join(base, 'secret.txt')))).toBeNull();
    expect(r(path.join(base, 'secret.txt').split(path.sep).join('/'))).toBeNull();
  });

  it('rejects the root itself, NUL bytes and malformed encoding', () => {
    for (const p of ['', '.', './', 'sub/..', 'a.txt%00.png', 'a.txt\0', '%E0%A4%A', '%']) {
      expect(r(p)).toBeNull();
    }
  });

  it('accepts a real file whose name merely starts with two dots', () => {
    expect(r('..notes.txt')).toBe(path.join(root, '..notes.txt'));
  });

  it('treats backslashes as separators where the platform does', () => {
    const got = r('..%5csecret.txt');
    if (path.sep === '\\') expect(got).toBeNull();
    else expect(got).toBe(path.join(root, '..\\secret.txt'));
  });
});

describe('createFileServer', () => {
  // A raw request: fetch() would normalise "/files/../x" before sending it.
  const get = async (rawPath, method = 'GET') => {
    const server = solution.createFileServer(root);
    await new Promise((res) => server.listen(0, '127.0.0.1', res));
    try {
      return await new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: server.address().port, path: rawPath, method }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
          res.on('error', reject);
        });
        req.on('error', reject);
        req.end();
      });
    } finally {
      server.closeAllConnections?.();
      await new Promise((res) => server.close(res));
    }
  };

  it('serves a file with safe headers', async () => {
    const res = await get('/files/sub/b.txt?download=1');
    expect(res.status).toBe(200);
    expect(res.body).toBe('hello b');
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-length']).toBe('7');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('400s traversal attempts and never leaks the secret', async () => {
    for (const p of ['/files/../secret.txt', '/files/..%2fsecret.txt', '/files/%2e%2e%2fsecret.txt', '/files/sub/../../secret.txt', '/files/..%2ffiles-secret%2fkey.pem', '/files/a.txt%00']) {
      const res = await get(p);
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'bad-path' });
      expect(res.headers['content-type']).toMatch(/application\/json/);
    }
    const bs = await get('/files/..%5csecret.txt');
    expect(bs.body.includes('TOP SECRET')).toBe(false);
  });

  it('404s missing files and directories', async () => {
    for (const p of ['/files/nope.txt', '/files/sub', '/files/sub/']) {
      const res = await get(p);
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'not-found' });
    }
  });

  it('serves the literally named file for a double-encoded path', async () => {
    const res = await get('/files/%252e%252e%252fsecret.txt');
    expect(res.status).toBe(200);
    expect(res.body).toBe('a literal name');
  });

  it('does not follow a link out of the root', async () => {
    if (!linked) return;
    const res = await get('/files/link/key.pem');
    expect(res.status).toBe(404);
    expect(res.body.includes('PRIVATE KEY')).toBe(false);
  });

  it('404s other routes and methods', async () => {
    expect((await get('/secret.txt')).status).toBe(404);
    expect((await get('/files/a.txt', 'POST')).status).toBe(404);
  });
});
