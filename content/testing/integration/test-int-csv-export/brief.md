Finance opens the monthly orders export in a spreadsheet, and every row
after `Smith, Jones & Co` has shifted one column to the right. The next
month the last day's orders are missing, because the filter was
`placedAt < to`. The month after that, someone sets their company name to
`=HYPERLINK("http://evil.example","Invoice")`, and it arrives in the
export as a live formula. The endpoint's test checked that the response
was `200` and had more than one line.

A file export is an API whose client is a spreadsheet. The bytes matter:
quoting, line endings, number formats, the date range and the download
headers. Test them through the real endpoint, with data chosen to hit
each rule.

## The API under test

`createApp({ orders })` returns an unstarted `http.Server`. `orders` is an
array of `{ id, customer, totalCents, placedAt }`, where `placedAt` is an
ISO timestamp such as `'2024-01-31T23:15:00Z'`.

`GET /reports/orders.csv?from=YYYY-MM-DD&to=YYYY-MM-DD`

- `from` or `to` missing or malformed, or `from` after `to`: `400`
  `BAD_RANGE` (JSON error envelope).
- Otherwise `200` with a media type of **`text/csv`** and a
  **`Content-Disposition`** that is an `attachment` with the filename
  `orders-<from>-to-<to>.csv`.
- The body is CSV: the header line `id,customer,total,placedAt`, then one
  line per order whose `placedAt` **date** is between `from` and `to`,
  **both inclusive**, ordered by `placedAt`. **Every line ends with
  `\r\n`**, including the last.
- `total` is `totalCents` as a decimal with **two places**: `1234` →
  `12.34`, `5` → `0.05`, `-250` → `-2.50` (a refund).
- A field that contains `,`, `"`, `\r` or `\n` is wrapped in double quotes,
  and each `"` inside it is **doubled** (`Say "hi"` → `"Say ""hi"""`).
- A text field that **starts** with `=`, `+`, `-` or `@` gets a `'` put in
  front of it (`=SUM(A1)` → `'=SUM(A1)`), so a spreadsheet shows it as
  text instead of running it. Then the quoting rule applies as usual.

## Your task

Write a test file that uses `describe` / `it` / `expect` and `fetch` against
the global `solution` (also available as `subject`). The starter's
`withApp` seeds the orders, starts the server on port `0`, and **closes it
in a `finally`**.

- Write **at least 7 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same**. The CSV
  bytes are identical, but it sends `text/csv;charset=UTF-8` and an unquoted
  `filename=`. So check the media type and the filename, not the exact
  header strings.
- Eight planted bugs must each make at least one of your tests fail.

## The trap

Test data decides what a test can see. Orders named `Alice` and `Bob`, with
round totals, placed in the middle of the month, pass against every bug
here. Put an order on the **last day** of the range, give one customer a
comma, one a quote and one a leading `=`, and use totals such as `5` and
`-250`.
