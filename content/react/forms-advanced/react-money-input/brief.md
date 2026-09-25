A price field looks like the simplest input on the page. Then:

- `<input type="number">` with `value={amount}` and
  `onChange={(e) => setAmount(Number(e.target.value))}` turns an emptied
  field into `0`, and fights the user typing `12.` (it becomes `12`, so they
  can never type `12.5`).
- `Math.floor(parseFloat('1.15') * 100)` is `114`, because `1.15 * 100` is
  `114.99999999999999` in floating point. Someone is now a cent short.
- The value is stored as cents but shown as `1,234.50`, and keeping the
  displayed text in sync with the number (without rewriting what the user is
  in the middle of typing) is where the real bugs are.

The fix is to keep **two** things: the number the rest of the app sees
(cents, or `null` for empty), and the **text** the user is editing.

## Task

Export `MoneyInput({ label, valueCents, onChange })`. It is controlled by
`valueCents` (an integer, or `null` for empty); `onChange(cents)` reports a
new value (an integer, or `null`).

**Markup**: a `<label>` with `label` for an `<input type="text"
inputMode="decimal">`. When the text is invalid, the input has
`aria-invalid="true"` and `aria-describedby` pointing at an element that
says `Enter an amount like 12.50`; otherwise neither attribute is present and
no message is shown.

**Formats**

- **Display** (not focused): thousands separators and two decimals:
  `123456` shows `1,234.56`, `5` shows `0.05`, `null` shows an empty field.
- **Editing** (focused): the same without separators, so the caret does not
  jump around commas: focusing `1,234.56` shows `1234.56`.

**Parsing** what the user types: ignore surrounding spaces and any commas;
empty means `null`; otherwise it must be digits with an optional `.` and at
most two decimal places, with at least one digit somewhere (`12`, `12.`,
`12.5`, `.5`, `0.05` are fine; `12.345`, `1.2.3`, `abc`, `.` are not).
Convert to cents **without floating-point error** (`1.15` is `115`,
`0.29` is `29`).

**Behaviour**

1. On every change, if the text parses to something other than
   `valueCents`, call `onChange` with it. If it does not parse, show the
   error and do not call `onChange`.
2. While editing, the text is the user's: when the parent passes back the
   value they just typed, the text is **not** rewritten (`12.` stays `12.`).
3. On blur, valid text is reformatted for display (`1234.5` becomes
   `1,234.50`); invalid text is left as it is, error included.
4. When `valueCents` changes to something the current text does not
   represent (the parent loaded a record, or reset the form), the text is
   replaced: in the display format when not focused, the editing format
   when focused.
