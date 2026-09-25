`GET /me/settings` should return one JSON object: every setting the app
knows, with the user's value where they changed it and the default where they
did not. The usual version loads the defaults, loads the overrides, and
merges two dictionaries in application code — on every request, for every
user in an admin export.

`jsonb_object_agg(key, value)` builds that object in the query: one row per
key in, one object out. Three things go wrong with it:

- **Zero rows aggregate to SQL `NULL`,** not `{}`. A user with no overrides
  gets `"overrides": null` and the frontend's `Object.keys(overrides)` throws.
  Wrap the aggregate in `coalesce(..., '{}')`.
- **A `NULL` key is an error.** Aggregate over a left join and the "no match"
  row has a `NULL` key: `jsonb_object_agg` raises
  `field name must not be null`. Filter those rows out with
  `filter (where ... is not null)`.
- **SQL `NULL` is not JSON `null`.** A user who set `digest` to `null` meant
  "no digest". That is the jsonb value `'null'`, which is not SQL `NULL`, so
  `coalesce(override, default)` keeps it — but `jsonb_strip_nulls` or a
  `where value <> 'null'` would silently put the default back.

Settings also get retired: `user_settings` still holds overrides for keys that
no longer exist in `setting_defaults`, and they must not reach the API.

The fixture has `users(id, email)`, `setting_defaults(key, value jsonb)` and
`user_settings(user_id, key, value jsonb)`.

## Task

One query, one row per **user** (including users with no overrides), ordered
by `id`:

| column | type | value |
| --- | --- | --- |
| `id` | int | |
| `email` | text | |
| `settings` | jsonb | an object with **every key in `setting_defaults`**: the user's value if they have one for that key, otherwise the default |
| `overrides` | jsonb | an object with only the user's own values for keys that exist in `setting_defaults`; `{}` when there are none |

Keys in `user_settings` that are not in `setting_defaults` appear in neither
object. JSON types are preserved: `false` stays a boolean, `50` a number, and
an override of JSON `null` appears as `null` (the key is present).
