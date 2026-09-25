Accessible form fields need ids: `<label htmlFor>` points at the input, and
`aria-describedby` points at the hint and error text so a screen reader reads
them when the input gets focus. Where do those ids come from?

- A hardcoded `id="email"` breaks the moment the field appears twice on a page.
- `Math.random()` in render changes on every render.
- A module-level counter (`let next = 0; … useState(() => 'field-' + next++)`)
  is stable and unique — until the page is server-rendered. The server counts
  from 0, the browser counts from wherever it is, the ids differ, and React
  reports a hydration mismatch.

`useId()` exists for exactly this: an id derived from the component's position
in the tree, identical on server and client.

## Task

Export `TextField({ label, hint, error, id, ...inputProps })` rendering:

```html
<div>
  <label for="{inputId}">{label}</label>
  <input id="{inputId}" aria-describedby="…" aria-invalid="true" …inputProps />
  <p id="{hintId}">{hint}</p>            <!-- only when hint is given -->
  <p id="{errorId}" role="alert">{error}</p>  <!-- only when error is given -->
</div>
```

- `inputId` is the `id` prop when the caller passes one, otherwise generated
  with `useId()`. Hint and error ids must also be unique on the page (derive
  them from the same `useId()` value, e.g. `${base}-hint`).
- `aria-describedby` lists the hint id then the error id, separated by one
  space, including only the ones that are rendered. With neither, the
  attribute must be **absent** (not an empty string).
- `aria-invalid="true"` only when there is an `error`; absent otherwise.
- every other prop (`name`, `type`, `value`, `onChange`, …) goes on the
  `<input>`.
- ids are stable across re-renders, unique across instances, and the markup
  must hydrate without a mismatch after `renderToString`.
