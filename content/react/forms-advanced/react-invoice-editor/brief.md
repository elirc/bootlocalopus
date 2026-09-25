Boss: an invoice editor. Line items you can add and remove, totals that
update as you type, validation that waits until it is useful, and a server
that answers `422` with errors keyed by **line index**, which is only
correct for the lines as they were when you pressed Save.

## Task

Export `InvoiceEditor({ onSubmit })`, a `<form>` that starts with one empty
line. `onSubmit(invoice)` returns a promise.

### Lines

Each line (numbered from 1 in the current order) has:

- inputs labelled `Line <n> description`, `Line <n> quantity` and
  `Line <n> unit price` (all `type="text"`);
- an `<output>` with `aria-label="Line <n> total"`;
- a `Remove line <n>` button (`type="button"`).

Give each line a stable id and key by it. `Add line` (`type="button"`)
appends an empty line and focuses its description. Removing a line focuses
the description of the line that took its place, else the new last line,
else `Add line`.

### Parsing and totals

- **Quantity**: a whole number above 0 (`/^\d+$/` and not `0`), after
  trimming.
- **Unit price**: after trimming, digits with an optional `.` and at most
  two decimals, at least one digit (`12`, `12.5`, `.5`, `0.05`), converted
  to integer cents **without floating-point error**.
- A line total is `quantity × unit price`, shown as `$` + thousands
  separators + two decimals (`$1,234.50`), or `—` (an em dash) when either
  value does not parse.
- An `<output aria-label="Total">` shows the sum of every line total that
  parses, in the same format (`$0.00` when none do).

### Validation

| Field | Message when invalid |
| --- | --- |
| description (trimmed) empty | `Enter a description` |
| quantity does not parse | `Enter a whole number above 0` |
| unit price does not parse | `Enter a price like 12.50` |

- No messages until the first submit attempt. From then on, messages
  follow every change (they disappear when a field is fixed and come back if
  it breaks again).
- A shown message sits in an element linked by `aria-describedby`, with
  `aria-invalid="true"` on the input.
- With **no lines at all**, submitting shows `Add at least one line` in a
  `role="alert"` element.
- A failed submit focuses the **first invalid input in document order**.

### Saving

- A valid submit calls `onSubmit({ lines })` **once**, where each line is
  `{ description, quantity, unitPriceCents }` (trimmed description,
  numbers for the rest). `Save` is disabled while pending and another
  submit does nothing.
- If the promise rejects with `error.details`, an object whose keys look
  like `lines.<index>.<field>` (`field` is `description`, `quantity` or
  `unitPrice`), show each message on that field **of the line that had that
  index when Save was pressed**. The user may have added or removed lines
  while the request was in flight; a key for a line that has since been
  removed is dropped, and other keys are ignored. Focus the first field with
  a server message, in document order. A server message disappears when its
  field is edited.
- If it rejects without any usable `details`, show `Could not save the
  invoice` in the `role="alert"` element. The next submit clears it.
