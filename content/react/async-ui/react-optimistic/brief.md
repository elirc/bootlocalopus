An optimistic update shows the result before the server confirms it. The
part people skip is the unhappy path: if the request fails you must put the old
value back **and** say so.

## Task

Export `LikeButton({ initialLikes, initialLiked, save })` where
`save(nextLiked)` resolves on success and rejects on failure.

- The button's accessible name is `Like` or `Unlike` depending on state
- It renders the count in a `<span data-testid="count">`
- Clicking updates the count and label **immediately**, then calls `save`
- On rejection, restore the previous count and label, and render
  `Could not save. Try again.`
- While a save is in flight the button is disabled (no double-fire)
- A successful save after a failure clears the error message