Not every form needs a `useState` per field. A feedback form that is filled
in once and sent has no field that affects another, no live validation, and
nothing to show while typing. Let the DOM hold the values, and read them all
at once with `FormData` on submit. It is less code, it re-renders nothing on
each keystroke, and `form.reset()` puts everything back.

Reading `FormData` has its own traps:

- An unchecked checkbox is **absent**: `data.get('subscribe')` is `null`, and
  a checked one is `'on'` (unless it has a `value`). It is not a boolean.
- Several checkboxes with one `name` need `data.getAll(name)`; `get` returns
  only the first.
- Every value is a **string**, radio buttons included.
- `event.currentTarget` is only set while the event is being dispatched.
  After an `await` in the handler it is `null`, so `event.currentTarget.reset()`
  on success throws. Keep a reference to the form before awaiting.

## Task

Export `FeedbackForm({ onSubmit, initial })`. `initial` is optional and
defaults to `{ name: '', rating: null, topics: [], message: '', subscribe: false }`;
use it for the fields' **default** values (`defaultValue`,
`defaultChecked`), which is also what `form.reset()` restores.

**Fields** (use these `name`s and labels)

- `name`: a text input labelled `Name`, `required`.
- `rating`: five radio buttons labelled `1` to `5` with values `'1'`–`'5'`,
  in a `<fieldset>` whose `<legend>` is `Rating`; the group is `required`.
- `topics`: checkboxes labelled `UI`, `Performance`, `Docs`, with values
  `ui`, `performance`, `docs`.
- `message`: a textarea labelled `Message`.
- `subscribe`: a checkbox labelled `Email me updates`.
- A `Send feedback` submit button.

**Submitting** (`preventDefault()` first)

1. If `form.checkValidity()` is false, call `form.reportValidity()` (the
   browser shows its messages) and stop.
2. Otherwise call `onSubmit` with
   `{ name, rating, topics, message, subscribe }`: `name` and `message`
   trimmed, `rating` a **number**, `topics` an array of the checked values
   in the order they appear (possibly empty), `subscribe` a boolean.
3. While its promise is pending, `Send feedback` is disabled and another
   submit does nothing.
4. When it resolves, reset the form to its defaults. When it rejects, keep
   everything the user entered and show `Could not send feedback` in a
   `role="alert"` element (cleared by the next submit).
