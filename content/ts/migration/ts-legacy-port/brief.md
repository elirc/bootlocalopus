`report.js` has produced the monthly sales report for years. Porting it to
TypeScript, you replace its `any`s with the real types, and the compiler
immediately objects to three lines:

```
This comparison appears to be unintentional because the types 'number' and 'string' have no overlap.
The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
Type 'string' is not assignable to type 'number'.
```

The usual reaction is that the types are being fussy about working code. They
are not: each error is a bug that has been in production all along. Every
customer shows as "Unknown customer" because the CSV's `"7"` never equals the
API's `7`. A blank discount cell makes the row `NaN`, because
`parseInt('')` is `NaN`. And the total is `"100200300"`, because a `reduce`
that starts from `''` concatenates. One more bug has no compiler error at all:
the comparator never returns `0`, so orders with equal totals come out in
whatever order the engine likes.

This lesson has **runtime** tests: port the function properly, with the bugs
fixed.

## Task

Rewrite **`buildReport(orders, customers, range)`** with the types in the
starter (no `any`) so that it:

- **skips** orders with `status` `'cancelled'` and orders whose `placedAt`
  (`YYYY-MM-DD`) is outside `range.from`–`range.to`, **inclusive** (ISO dates
  compare correctly as strings). Skipped orders are not validated;
- matches `order.customerId` (a string) to `customer.id` (a number). The row's
  `customer` is the name, or `'Unknown customer'`;
- computes `netPence = totalPence − discountPence` as a **number**. An empty
  cell is `0`; any other value must be digits only (`/^\d+$/`), otherwise
  throw `Error('Invalid <field> on order <id>')`, where `<field>` is
  `totalPence` or `discountPence`;
- sorts rows by `netPence` **descending**, ties by `orderId` ascending;
- returns `{ rows, totalPence, unknownCustomers }`: `totalPence` is the sum of
  the rows' `netPence` (a number, `0` for none), and `unknownCustomers` is
  the unmatched customer ids, **each once, sorted**.

Rows have exactly `orderId`, `customer`, `netPence`, `placedAt`.
