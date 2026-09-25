You convert a service to ES modules and `__dirname` is gone. The first fix
anyone reaches for is:

```js
const here = new URL('.', import.meta.url).pathname;
```

It works on your Mac. On a Windows laptop it gives `/C:/Users/...` (a leading
slash before the drive), and in any folder with a space it gives
`/Users/sam/My%20Projects/...`, so `fs.readFile` fails with `ENOENT`.
The second fix, `new URL('./seed #1.json', import.meta.url)`, quietly treats
`#1.json` as a URL **fragment** and loads `seed ` instead. And `path.resolve('./config.json')`
resolves against `process.cwd()`, the directory someone happened to start
node from, not the file the code lives in.

`import.meta.url` is a `file:` **URL**. Convert it with `fileURLToPath`, do
path work with `node:path`, and convert back with `pathToFileURL` when you
need something `import()` will accept: on Windows, `import('C:\\app\\x.js')`
throws, because `C:` looks like a URL scheme.

## Task

Export five functions. `metaUrl` is always a module's `import.meta.url`.

- `moduleFile(metaUrl)` — the module's absolute file path (the old
  `__filename`), decoded: spaces are spaces, `#` is `#`.
- `moduleDir(metaUrl)` — the directory that file is in (the old `__dirname`).
- `resolveFrom(metaUrl, relativePath)` — `relativePath` resolved against the
  **module's directory**, as an absolute, normalised file path. `../` works;
  an absolute `relativePath` is returned normalised. File names may contain
  spaces, `#`, `?` and `%`.
- `toImportSpecifier(filePath)` — for an absolute file path, the string to
  pass to `import()`: a `file:` URL with every special character encoded.
- `isEntrypoint(metaUrl, argv1 = process.argv[1])` — the ESM replacement for
  `require.main === module`: `true` when `argv1` (the script node was
  started with) is this module. `argv1` may be relative (resolve it against
  `process.cwd()`) and may omit the file extension (`node server` runs
  `server.js`). `false` when `argv1` is missing or empty (a REPL, or code
loaded with `import()` by a test runner) or names any other file, including
one whose path merely starts with this one.

Use `node:url` and `node:path`; do not build paths by string concatenation.
