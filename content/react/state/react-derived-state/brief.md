Copying props into state creates two sources of truth. The copy is taken
once, on mount, and then quietly drifts.

## Task

`UserCard` below has two bugs of exactly this kind:

1. `fullName` is copied into state, so it never updates when the `user` prop
   changes.
2. `itemCount` is stored in state and synced in an effect, which renders one
   frame of stale data and re-renders twice.

Fix both by **deriving during render**. Keep the same props and rendered
output. Do not add `useEffect`; remove the one that is there.

The component must render:

- an `<h2>` with the full name (`first last`)
- a `<p>` reading ````3 items```` (or ````1 item```` when singular)
- a `<span>` reading `Verified` or `Unverified`