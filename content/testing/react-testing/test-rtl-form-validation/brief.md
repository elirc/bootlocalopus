The signup form showed red error text under each field, and its tests
checked that the text appeared. A screen-reader user pressed "Create
account" and heard nothing. Focus stayed on the button, the inputs weren't
marked invalid, and the messages weren't connected to anything. Then the
server got two accounts for one person, because the button stayed enabled
while the first request was in flight.

A form's behaviour is more than the error text: **where focus goes**, what
assistive technology is told (**`aria-invalid`**, **`aria-describedby`**),
**what gets submitted**, and **how often**. Each of those is observable
from the DOM, so each can be tested.

## The component under test

`<SignupForm onSubmit={fn} />`. `onSubmit({ email, password })` may return
a promise.

- Three fields, each found by its label: **`Email`**, **`Password`**, and a
  checkbox **`I accept the terms`**. The button is **`Create account`**.
- On submit, every field is validated:

  | field | rule | error text |
  | --- | --- | --- |
  | Email | after trimming, looks like `x@y.z` | `Enter a valid email address` |
  | Password | **at least 8** characters | `Password must be at least 8 characters` |
  | Terms | checked | `You must accept the terms` |

- A field with an error has **`aria-invalid="true"`**, and its
  **`aria-describedby`** points at the element that holds its error text.
- If anything is invalid, `onSubmit` is **not** called, and **focus moves
  to the first invalid field** (in the order Email, Password, Terms).
- Once a field has shown an error, the error **disappears as soon as the
  user types a valid value** into it. They don't have to submit again.
- If everything is valid, `onSubmit` is called **once** with the email
  **trimmed** and the password as typed. While its promise is pending,
  the button is **disabled** (its text changes to `Creating account…`), so
  a second click does nothing. If the promise rejects, its message is shown
  in an element with `role="alert"`.

## Your task

Write a test file (JSX is allowed) that uses `describe` / `it` / `expect`
against the global `solution` (also available as `subject`).
`render`, `screen`, `fireEvent`, `act` and `within` are globals. There are
**no jest-dom matchers**.

- Write **at least 8 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** but uses
  `<span>` errors with different ids and class names. Find fields with
  `getByLabelText`, and find an error **through the input's
  `aria-describedby`**, not by class or tag.
- Eight planted bugs must each make at least one of your tests fail.

## The trap

`screen.getByText('Enter a valid email address')` passes when the message
is on the page but connected to nothing. Follow the link from the input:
`document.getElementById(input.getAttribute('aria-describedby'))`. And test
the password rule **on** the boundary: 7 characters fails, 8 passes.
