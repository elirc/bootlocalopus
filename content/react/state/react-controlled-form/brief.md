A controlled input's value comes from state, so state is always the truth.
The mistakes are a copy-pasted `useState` and handler per field, forgetting
`preventDefault`, and validating on submit only.

## Task

Export `SignupForm({ onSubmit })`:

- Two inputs, `email` and `password`, with `name` attributes to match
- Each input has an accessible label matching its name (`Email`, `Password`)
- The submit button reads `Sign up` and is **disabled** until the email
  contains an `@` and the password is at least 8 characters
- On submit, call `onSubmit({ email, password })` and do **not** reload the page
- After a successful submit, both fields are cleared

Hold both fields in **one** state object with **one** `onChange` handler keyed
on `event.target.name`. That is the shape that scales to a twenty-field form.
The grader cannot see your state's shape; what it checks is the bug that shape
invites — `setValues({ [name]: value })` without spreading the previous values
wipes the other field.

A note on the disabled button: it is the simplest thing to grade, but a
disabled button gives no reason and is skipped by keyboard focus. Many
production forms keep submit enabled and show the validation messages on
submit instead.
