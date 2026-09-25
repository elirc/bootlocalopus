Splitting a long checkout into steps makes it easier to fill in, and gives
you three new ways to lose the user:

- Each step keeps its fields in **its own** `useState`. Steps unmount when
  you move on, so pressing **Back** shows empty fields.
- **Next** validates the whole form, so step 1 refuses to continue because
  the step-3 fields are empty; or it validates nothing, and the user finds
  out on the last step that their email was wrong.
- The content swaps but **focus** stays on the Next button, now at a
  different place in a different step. A screen reader user hears nothing
  and does not know the step changed.

## Task

Export `CheckoutWizard({ onSubmit })`, one `<form>` with three steps:
`Contact`, `Shipping`, `Review`. `onSubmit(order)` returns a promise.

**On every step**

- `<ol aria-label="Progress">` with one `<li>` per step title; the current
  one has `aria-current="step"`.
- An `<h2 tabIndex={-1}>` reading `Step <n> of 3: <title>`. When the step
  **changes**, focus moves to it (not on the first render).

**Contact** has an input labelled `Email`. **Shipping** has inputs labelled
`Address` and `City`. Both steps have a `Next` **submit** button (so Enter in
a field means Next), and Shipping has a `Back` button (`type="button"`).

**Next** validates **only the current step's fields**, on their trimmed
values:

| Field | Invalid when | Message |
| --- | --- | --- |
| Email | not `something@something`, no spaces | `Enter a valid email` |
| Address | empty | `Enter an address` |
| City | empty | `Enter a city` |

On failure: stay on the step, show each message in an element linked from
its input by `aria-describedby`, set `aria-invalid="true"` on the input,
and focus the **first** invalid input. Editing a field removes its error.
On success: go to the next step.

**Back** goes to the previous step without validating. Every value typed
on any step survives moving between steps.

**Review** shows the three values (trimmed) and has an `Edit contact` and
an `Edit shipping` button (`type="button"`) that jump to that step, a
`Back` button, and a `Place order` submit button. Placing the order calls
`onSubmit({ email, address, city })` with trimmed values, **once**: the
button is disabled while the promise is pending and a second submit does
nothing. If it rejects, stay on Review and show
`Could not place the order. Try again.` in a `role="alert"` element.
