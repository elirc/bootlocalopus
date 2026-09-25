`select to_jsonb(u) from users u` is the fastest way to build an API
response, and the fastest way to publish a password hash. It serialises
**every** column — today's `email` and `password_hash`, and whatever column
somebody adds next year. The deny-list fix, `to_jsonb(u) - 'password_hash' -
'email'`, is exactly as safe as everyone's memory: the day a migration adds
`stripe_customer_id`, it is public, and no test or review of *this* query
could have caught it, because this query did not change.

Public output is an **allow-list**: name every field that may leave the
building, with `jsonb_build_object('handle', u.handle, ...)`. A new column is
then private until someone adds it on purpose.

The API contract also says optional fields are **absent** when unset, not
`null` (the mobile client treats `"bio": null` as "the user cleared their
bio"). `jsonb_strip_nulls(...)` removes keys whose value is JSON `null`. Note
what it does not remove: an empty string is a value.

The fixture has `users(id, handle, display_name, bio, avatar_url, email,
password_hash, is_admin, created_on date, deleted_at timestamptz)`. `bio` and
`avatar_url` are nullable; the other public columns are `NOT NULL`.

## Task

One query, one row per **live** user (`deleted_at is null`), ordered by `id`,
with columns `id` and `profile` (`jsonb`):

```json
{
  "id": 1,
  "handle": "ada",
  "display_name": "Ada Lovelace",
  "bio": "Analyst of engines",
  "avatar_url": "https://cdn.example.com/u/ada.png",
  "created_on": "2023-01-15"
}
```

- `profile` has **only** these six keys, named exactly as above.
- `bio` and `avatar_url` are **omitted** when the column is `NULL`; an empty
  string `''` is kept.
- Nothing else from `users` appears — not now, and not after a column is added
  to the table (the grader adds one and reruns your query).
