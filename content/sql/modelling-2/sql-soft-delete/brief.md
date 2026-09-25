"Never really delete a user" sounds like one column: `deleted_at`. Then the
first deleted user tries to sign up again, and the `unique (email)` constraint
you have had since day one says no — the deleted row still owns the email.
Drop the constraint and two *live* accounts can now share an address.

The fix is a uniqueness rule that only covers live rows: a **partial unique
index**, `... where deleted_at is null`. While you are there, make it
case-insensitive (`lower(email)`), because `Ada@x.com` and `ada@x.com` are the
same inbox.

The other half of soft delete is that every query now needs
`where deleted_at is null`, and somebody will forget it. A view that already
has the filter is the default you point application code at.

The fixture has `users(id serial primary key, email text not null, name text
not null)` with a plain unique constraint named **`users_email_key`**, and
some rows.

## Task

Write a migration that:

1. Adds `deleted_at timestamptz` — nullable; `NULL` means live.
2. Drops the constraint `users_email_key`.
3. Creates a **unique** index named `users_live_email_idx` on `lower(email)`,
   covering only rows where `deleted_at is null`.
4. Creates a view `live_users` with the columns `id`, `email`, `name` of
   every user that has not been deleted.

The existing rows and ids must survive (do not drop the table).

Rules the grader checks:

- two live users cannot share an email, **ignoring case** (`23505`);
- a deleted user's email can be used by a new live user;
- any number of deleted users can share an email;
- restoring a deleted user (`deleted_at = null`) whose email has since been
  taken by a live user fails with `23505`;
- `live_users` shows live users only.
