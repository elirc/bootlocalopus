# 002 — Shipping to GitHub with a credential you didn't set up

*2026-09-10 · Journal entry. A small decision with a security shape, worth recording because it is the kind seniors are expected to get right without being asked.*

## Context

The project needed to go to GitHub. The machine had no `gh` CLI, no
`GITHUB_TOKEN`, and no global git identity — but Windows Credential Manager
held a `git:https://github.com` entry from some earlier `git push`, and the
system gitconfig pointed `credential.helper` at it.

That meant a plain `git push` to an *existing* repo would authenticate. It did
not mean a repo could be *created* without either installing tooling or
using the stored token against the API directly.

## The decision, and why it was not mine to make alone

Three routes were available:

1. **Ask the user to create the empty repo** and push to it. No new software,
   no token handling. Slowest, most reliable.
2. **Install `gh`** via winget. Clean, but `gh` has its own auth store and its
   login flow is interactive — likely to stall in a non-interactive session.
3. **Read the stored token** with `git credential fill` and call the GitHub
   REST API. Fully automatable, but it means handling an access token whose
   scope I hadn't inspected, for a purpose (repo creation) broader than the
   one it was stored for (pushing).

I did the local commit — unambiguous, useful regardless — and then *asked*,
presenting all three with their trade-offs, alongside the public/private
choice. Two reasons this was a question and not a judgement call:

- **Visibility is irreversible in practice.** A public repo gets mirrored and
  indexed within hours. "Default to private, flip later" is the safe default,
  but the user may genuinely want public, and only they know.
- **Touching a stored secret is an escalation.** Even on the user's own
  machine, reading a credential out of the OS store and sending it somewhere
  is an action they should consciously authorise. The token turned out to be
  a `gho_` OAuth token with `repo`, `gist` and `workflow` scope — more reach
  than a push needs.

## What I did once authorised

- Retrieved the token into a shell variable and **never printed it** — the
  only things echoed were its length and the first four characters (which
  identify the token *type*, not the token).
- Checked `GET /user` first to confirm *whose* token it was and its scopes,
  and `GET /repos/:owner/:name` to confirm the name was free, before any
  write.
- Created the repo, added the remote, pushed, then verified the remote HEAD
  equalled the local HEAD and that the tree on GitHub had exactly the 41
  expected files and nothing gitignored.
- Told the user, in the summary, what the token could do and the one-line
  `cmdkey /delete` that revokes it locally if they'd rather it not sit there
  with that reach.

## The senior-level points

- **The safe local step first, the outward-facing step after confirmation.**
  A commit can be amended; a public push cannot be unpublished.
- **Least privilege is something you *check*, not assume.** Inspecting
  `X-OAuth-Scopes` before using the token took one request and turned "some
  credential" into a known quantity worth flagging.
- **Verify the effect, not the command.** `git push` printing `main -> main`
  is not the same as "the remote has what I meant." Comparing SHAs and listing
  the remote tree is thirty seconds and catches the class of bug where
  `.gitignore` swallowed something load-bearing.
- **A `.gitattributes` on day one.** The lesson content lives in template
  literals that get compiled and compared; CRLF drift would produce noisy
  diffs forever. `* text=auto eol=lf` before the first commit costs nothing.
  After the first commit it costs a normalisation commit.
