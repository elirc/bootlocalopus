React decides what to keep by **position and type**: the same component type
in the same place in the tree is the same instance, with the same state, on
the next render. Two everyday bugs come straight from that rule.

1. **A component declared inside another component.** `function Field()`
   written inside `ContactEditor`'s body is a *new function* on every render,
   so it is a new type. React unmounts the old `<input>` and mounts a fresh
   one on every keystroke. The user types one character and loses focus.
2. **State that should reset, but does not.** `useState(contact.name)` reads
   its argument on the first render only. Switch from Ada to Grace and the
   editor is still the same instance in the same spot, so it keeps Ada's
   draft. Press Save and Ada's typing is written onto **Grace's id**.

## Task

The contacts screen in the starter has both bugs. Fix `ContactsApp` so that:

- typing into **Name** or **Email** keeps the same input element and keeps
  focus in it;
- selecting a contact in the nav shows **that contact's** name and email;
- switching contacts **discards the unsaved draft** (switch away and back and
  you see the saved values again);
- **Save** calls `onSave({ id, name, email })` for the contact on screen, with
  whatever has been typed into it;
- the selected nav button keeps `aria-current="true"`.

Keep the markup: a `<nav aria-label="Contacts">` of buttons named after each
contact, and a form with a labelled `Name` input, a labelled `Email` input
and a `Save` submit button.

You could reset the draft with an effect that watches `contact.id`, but that
renders the stale draft once, then again, and gets harder with every field
you add. There is a one-attribute way to tell React "this is a different
editor now".
