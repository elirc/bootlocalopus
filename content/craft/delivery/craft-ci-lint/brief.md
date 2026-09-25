CI configuration is code that nobody reviews. It is YAML, it "works" the
first time it goes green, and it quietly holds the keys to production. The
incidents are always the same few: a job with no timeout that hangs for six
hours on every PR, a `needs:` pointing at a job that was renamed so the
deploy runs without the tests, a third-party action on `@v1` whose owner's
account was taken over, a PR title interpolated into a shell script, and the
classic "pwn request": `pull_request_target` checking out the fork's code and
running it with the repository's secrets.

Each one is mechanical to detect. A linter that runs on every change to
`.github/workflows/` catches them before review has to.

## Your task

Implement `lintWorkflow(workflow)`. `workflow` is a GitHub Actions workflow
file, already parsed from YAML into plain objects:

```js
{
  name: 'ci',
  on: { pull_request: {}, push: { branches: ['main'] } }, // or 'push', or ['push', 'pull_request']
  permissions: { contents: 'read' },                     // optional
  jobs: {
    build: { 'runs-on': 'ubuntu-latest', 'timeout-minutes': 10, steps: [
      { uses: 'actions/checkout@v4' },
      { run: 'npm ci && npm run build' },
    ] },
    deploy: { 'runs-on': 'ubuntu-latest', needs: ['build'], steps: [ … ] }, // needs can be a string or an array
  },
}
```

Return an array of problems `{ rule, where }`, **in any order**, one per
rule per place. `where` is `'workflow'`, `'jobs.<jobId>'` or
`'jobs.<jobId>.steps[<index>]'`. An empty array means the workflow is clean.

| `rule` | `where` | Problem |
| --- | --- | --- |
| `no-permissions` | `workflow` | No top-level `permissions` key. The default token can write to the repository. |
| `unknown-need` | job | The job's `needs` names a job that does not exist (one problem per job, however many names are unknown). |
| `needs-cycle` | job | The job is **on** a `needs` cycle: following `needs` from it leads back to it. A job that only depends on a cycle is not on it. |
| `no-timeout` | job | No `timeout-minutes`. The default is 360 minutes. |
| `unpinned-action` | step | `uses` is not pinned to a full commit sha (see below). |
| `untrusted-input` | step | `run` interpolates attacker-controlled text (see below). |
| `pr-target-checkout` | step | The workflow is triggered by `pull_request_target` and this step checks out the PR's code (see below). |

**Pinning.** A `uses` value is `owner/repo@ref` (possibly
`owner/repo/path@ref`). It is fine when:

- it starts with `./` (a local action) or `docker://`; or
- the owner is `actions` or `github` (GitHub's own) and it has **any** `@ref`;
  or
- the ref is exactly **40 lower-case hex characters**.

Anything else is unpinned, including a first-party action with no `@` at all.

**Untrusted input.** A step's `run` contains a `${{ … }}` expression that
mentions `github.head_ref`, or a `github.event.` path whose **last segment**
is `title`, `body`, `message` or `ref` (for example
`github.event.pull_request.title`, `github.event.pull_request.head.ref`).
Anyone who can open a PR controls those strings, and they are pasted into the
shell before it runs.

**PR target checkout.** `on` includes `pull_request_target` (as the string,
an item of the array, or a key of the object), and a step `uses` an
`actions/checkout` action whose `with.ref` mentions
`github.event.pull_request.head`.

## The traps

- `needs` can be a string. `needs: 'build'` is `['build']`.
- A cycle needs a real graph walk. `a → b → c → a` has no job that needs
  itself directly. Report `a`, `b` and `c`, and not the `d` that needs `a`.
- `actions/checkout@v4` is fine; `some-org/deploy@v4` is not. The rule is
  about who can move the tag, not about the format of the ref.
