`GET /notes/42` checks that you are **logged in**. It does not check that note
42 is **yours**. Change the number in the URL and you are reading someone
else's notes. This is an IDOR (insecure direct object reference), and it has
been the #1 entry on the OWASP API list for years. Authentication tells you
*who* is asking; authorization is checking, on **every object**, that they may
touch *this one*.

The starter is a working notes service with three real bugs of this kind:

1. `get`, `update` and `remove` find the note by id and never look at who owns it.
2. `list` returns everybody's notes.
3. `create` and `update` spread the client's input over the note, so a body
   of `{ "ownerId": "u2" }` plants a note in someone else's account (mass
   assignment).

## Where the check lives

In the **service**, not the handler. The service is what every caller goes
through — the HTTP handler today, a queue worker or an admin script tomorrow.
A check in one route handler is a check the next route forgets.

## 404, not 403

For a note that exists but is not yours, answer exactly as if it did not
exist. A `403` confirms the id is real, which lets an attacker enumerate ids.

## Task

An **actor** is `{ id: string, role: 'user' | 'admin' }`. The repository
(`createNoteRepo`) is given and correct; do not put rules in it.

`createNoteService({ notes })` returns async methods:

| Method | Behaviour |
| --- | --- |
| `create(actor, { title, body })` | stores `{ id, ownerId: actor.id, title, body }` and returns it. Any other input field (`ownerId`, `id`, …) is ignored. |
| `get(actor, id)` | the note, if the actor owns it **or is an admin** |
| `list(actor)` | the actor's own notes; an admin gets **all** notes. Ascending by id, as the repo returns them. |
| `update(actor, id, patch)` | only `title` and `body` may change; `ownerId` and `id` in the patch are ignored. Returns the updated note. |
| `remove(actor, id)` | deletes it; returns nothing |

For a missing note **and** for a note the actor may not see, `get`, `update`
and `remove` throw `NotFoundError` with the message exactly `note not found`
— the same error for both, so the caller cannot tell them apart. A foreign
`update` or `remove` must leave the note untouched.

`createNotesHandler(service, authenticate)` is the HTTP layer (mostly given).
`authenticate(req)` returns an actor or `null`. Finish it so that:

- no actor → `401` `{ "error": "unauthorized" }`
- a `NotFoundError` → `404` `{ "error": "not found" }` (the same body as an unknown route)
- `DELETE /notes/:id` → `204` with no body
- anything else unexpected → `500` `{ "error": "internal error" }`
