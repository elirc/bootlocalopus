The one-`useState`-per-field form from earlier works for two fields. At
twelve, every screen reinvents when errors appear, how screen readers hear
them, where focus goes on a failed submit, and what to do with the server's
`409 email already taken`. That logic belongs in one hook.

## Task

Export `useForm({ initialValues, validate, onSubmit })`. The form's fields
are the keys of `initialValues`.

- `validate(values)` returns an object of **messages keyed by field name**;
  a field with no problem has no key (or an empty/`undefined` value).
- `onSubmit(values)` returns a promise.

It returns:

| Key | What it is |
| --- | --- |
| `values` | current values |
| `errors` | the errors **currently shown**, `{ [name]: message }` |
| `submitting` | `true` only while `onSubmit`'s promise is pending |
| `formError` | a message for a server failure that maps to no field, else `null` |
| `register(name)` | props to spread on the `<input>` |
| `errorProps(name)` | props (just `{ id }`) to spread on the element that holds `errors[name]` |
| `handleSubmit` | the `<form onSubmit>` handler |

`register(name)` returns `{ id, name, value, onChange, onBlur, ref,
'aria-invalid', 'aria-describedby' }`. When the field has a shown error,
`aria-invalid` is `'true'` and `aria-describedby` is exactly
`errorProps(name).id`; otherwise both are `undefined` (so React omits them).
Ids must be unique per form instance (`useId`).

**When an error is shown** — validate on blur, then on change:

1. Typing in an untouched field shows nothing. Nobody wants "invalid email"
   after one keystroke.
2. On **blur** the field becomes *touched*; from then on its error tracks
   every change (it disappears the moment the value becomes valid, and comes
   back if it becomes invalid again).
3. A submit attempt touches every field.

**Submitting**

4. `handleSubmit` calls `event.preventDefault()`. If client validation fails,
   show every error, focus the **first invalid field in document order**
   (not key order), and do not call `onSubmit`.
5. Otherwise call `onSubmit(values)` once. `submitting` is `true` until it
   settles, and a second submit while pending is ignored. The submit button
   is disabled **only while submitting** — never "because the form is
   invalid", which hides the reason and skips keyboard focus.
6. If the promise rejects with an error that has `details` — an object
   `{ [field]: message }`, as the Node track's error envelope sends — show
   those messages on those fields (same `aria-*` wiring) and focus the first
   one in document order. Keys that are not fields are ignored.
   A server error on a field disappears as soon as that field is edited.
7. If it rejects without any field `details`, set `formError` to the error's
   `message`. The next submit attempt clears it.

The grader renders its own form around your hook: labelled inputs spread
`register(...)`, a `<p {...errorProps(name)}>` under each, and
`<button type="submit" disabled={submitting}>`.
