An upload widget built from booleans (`isUploading`, `isDone`, `error`,
`progress`) can be in states that make no sense: uploading **and** failed,
done with an error message still showing. Each bug report gets a new `if`.

Worse are **late events**. The user cancels an upload and starts another; the
first request's `progress` and `success` callbacks still arrive and overwrite
the new upload's state. The screen says "Done" for a file that is still
uploading.

Model it as a **state machine** instead: a `status` that decides which other
fields exist, and a reducer that accepts only the events that make sense in
the current status. Everything else returns the **same state object**, so
React does not even re-render. Late events are handled by tagging each upload
with an `attempt` number and ignoring events from any other attempt.

## Task

1. Export `uploadReducer(state, action)` and `initialUploadState`, which is
   `{ status: 'idle', attempt: 0 }`. The states are exactly:

   | status | shape |
   | --- | --- |
   | `idle` | `{ status, attempt }` |
   | `uploading` | `{ status, attempt, file, progress }` |
   | `done` | `{ status, attempt, file, url }` |
   | `failed` | `{ status, attempt, file, error }` |

   Actions:

   - `{ type: 'start', file }` from `idle`, `done` or `failed`: `uploading`
     with `attempt + 1` and `progress: 0`.
   - `{ type: 'retry' }` from `failed`: `uploading` with the same `file`,
     `attempt + 1`, `progress: 0`.
   - `{ type: 'progress', attempt, loaded, total }` while `uploading` the same
     attempt: `progress` becomes `Math.floor(loaded / total * 100)`, clamped
     to 0..100. Progress never goes backwards (a lower value is ignored).
   - `{ type: 'succeed', attempt, url }` while `uploading` the same attempt:
     `done`.
   - `{ type: 'fail', attempt, error }` while `uploading` the same attempt:
     `failed` with `error` (the message string).
   - `{ type: 'cancel' }` from `uploading`: `idle` (keep `attempt`).
   - `{ type: 'reset' }` from `done` or `failed`: `idle` (keep `attempt`).
   - Anything else, including an event for a different attempt or an unknown
     type, returns the **same state object**.

   New states contain only their own fields (no leftover `error` on
   `uploading`, no `progress` on `done`).

2. Export `Uploader({ file, upload })`. `upload(file, { signal, onProgress })`
   returns a promise for the file's URL and calls
   `onProgress(loaded, total)` as it goes. Render by status:

   - `idle`: a button `Upload`
   - `uploading`: `<p>Uploading {progress}%</p>` and a button `Cancel`, which
     aborts that upload's `signal`
   - `done`: a link `<a href={url}>View file</a>` and a button `Upload another`
     (reset)
   - `failed`: `<p role="alert">Upload failed: {error}</p>` and a button
     `Retry`

   Events from a cancelled or superseded upload must not change the screen.
