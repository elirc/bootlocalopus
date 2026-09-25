An invoice is where every number bug in this chapter meets the others. The
unit prices arrive as text from a CSV. The order discount has to be spread over
the lines, because each line may be taxed at a different rate. Tax is rounded
**per line**, and the rounding rule is not `Math.round`. The totals have to
add up to the cent — the line totals to the grand total, the tax summary to
the tax — or the accounting system rejects the batch. And the whole thing has
to work in yen (no minor unit) and Kuwaiti dinar (three) as well as pounds.

You have written every piece already. This boss puts them together.

## Task

Export `InvoiceError` (a subclass of `Error`, `name === 'InvoiceError'`, with
properties `line` — the zero-based line index, or `null` — and `field`) and
`computeInvoice(order)`.

### Input

```js
{
  currency: 'GBP',          // ISO 4217 code
  locale: 'en-GB',          // for the formatted strings
  discount: '10.00',        // optional: an amount off the whole order, as text; default none
  lines: [
    { sku: 'MUG', quantity: 2, unitPrice: '19.99', taxRateBps: 2000 },
    …
  ],
}
```

### Rules, in order

1. **Minor digits** come from the currency:
   `new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits`
   (GBP 2, JPY 0, KWD 3).
2. **Parse** each `unitPrice` and the `discount` with the rules of the
   *Parse money input* lesson (trimmed; optional commas in groups of three;
   at most that many fraction digits; no signs here — negatives are invalid).
   Invalid → `InvoiceError` with `field: 'unitPrice'` and the line index, or
   `field: 'discount'` and `line: null`.
3. `quantity` must be a positive safe integer **number** (`InvoiceError`,
   `field: 'quantity'`); `taxRateBps` a non-negative safe integer (`field:
   'taxRateBps'`).
4. **Net** per line = `quantity × unitPrice`.
5. **Discount**: allocate it over the lines **in proportion to their net**,
   using the largest-remainder rules of the *Split money* lesson. A discount
   greater than the subtotal is an `InvoiceError` (`field: 'discount'`,
   `line: null`). No discount (or zero) gives every line `0`.
6. **Tax** per line = `taxable × taxRateBps / 10 000` where
   `taxable = net − lineDiscount`, rounded **half to even** exactly.
7. Line `total = taxable + tax`.

Every amount must be exact (products of large prices and rates exceed 2⁵³);
throw a `RangeError` if any amount is not a safe integer.

### Output

```js
{
  currency: 'GBP',
  digits: 2,
  lines: [{ sku, quantity, unitPrice, net, discount, taxable, tax, total }, …],  // minor units
  taxes: [{ rateBps, taxable, tax }, …],   // one per distinct rate, ascending by rateBps
  subtotal,   // Σ net
  discount,   // the order discount
  tax,        // Σ line tax
  total,      // subtotal − discount + tax  (= Σ line total)
  formatted: { subtotal, discount, tax, total },  // Intl currency strings in `locale`
}
```

`formatted` uses `new Intl.NumberFormat(locale, { style: 'currency', currency })`.
Format the **exact** decimal: `format` accepts a decimal **string** such as
`'90071992547409.91'`, while dividing by 100 first would turn that into
`…409.90`.
