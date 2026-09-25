The CRM import has 40 000 rows and the same person in it four times:
`Ana@Shop.com`, `ana@shop.com `, one row with a phone number, one with a
company. "Deduplicate" in the ticket means **merge**: one contact per person,
with every piece of information any of the rows had.

The first attempt is usually `rows.filter((r, i) => rows.findIndex(...) === i)`,
which is quadratic (the import takes a minute), compares raw emails (so
`Ana@Shop.com` and `ana@shop.com ` stay separate), and keeps the first row
whole (so the phone number in row three is thrown away).

## Task

Export `mergeContacts(contacts)`. Each input contact has a string `email` and
optionally `name`, `phone`, `company` (strings) and `tags` (an array of
strings). Return a **new** array of **new** objects, each with exactly these
keys:

```js
{ email, name, phone, company, tags }
```

Rules:

1. **Identity.** Two contacts are the same person when their emails are equal
   after `trim()` and `toLowerCase()`. The output `email` is that normalised
   form.
2. **Text fields** (`name`, `phone`, `company`): the **first** value, in input
   order, that is a non-blank string, trimmed. A later row fills a gap; it never
   overwrites. No value at all → `null`.
3. **Tags**: the union of every row's tags, each tag once, in the order first
   seen. Always an array (possibly empty).
4. **Order**: a merged contact appears where its person **first** appears in
   the input.
5. **No usable email** (missing, not a string, or blank after trimming): the
   contact is never merged with anything. It still appears in its own position,
   cleaned by rules 2 and 3, with `email: null`.
6. Do not mutate the input. It must stay fast on 100 000 rows.
