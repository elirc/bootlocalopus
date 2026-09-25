A marketplace splits every order's payment between the seller, the
platform and a referral partner. The tests check that £100 split 50/30/20
gives 5000, 3000 and 2000 cents. They pass. In production, a £10.01 order
split three ways pays out 1000 cents, because each share was rounded down
and the leftover cent was dropped. Finance finds the gap between payouts
and takings a month later.

Examples check the cases you thought of. An **invariant** is a statement
that holds for *every* valid input, for instance "the parts add up to the
total". You can check an invariant against **thousands of generated
inputs** in one loop. That is the core idea behind property-based testing
(fast-check, Hypothesis), and a loop in plain JavaScript is enough to use it.

Invariants and examples do different jobs. Invariants catch whole classes of
bug. Examples pin down the **policy**, which here means which part gets the
spare cent.

## The function under test

`allocate(totalCents, ratios)` splits a whole number of cents across parts
in proportion to `ratios`, and returns an array of whole cents, one per
ratio.

1. Each part first gets the **floor** of its exact share,
   `totalCents * ratio / sum(ratios)`.
2. The cents left over go out **one each** to the parts with the **largest
   remainders**. When remainders tie, the **earlier** part wins.

So `allocate(100, [1, 2])` is `[33, 67]`, `allocate(100, [1, 1, 1])` is
`[34, 33, 33]`, and a part with ratio `0` always gets `0`.

It throws a **`RangeError`** if the total is negative or not a whole number,
if `ratios` is empty, or if every ratio is zero.

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`).

- Write **at least 6 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same** (it hands
  out one cent at a time to the best remaining part).
- Six planted bugs must each make at least one of your tests fail.

## The trap

Two of the bugs keep every invariant: the parts still add up and each is
within a cent of exact. Only an example with a known answer can tell them
apart from the correct code. The other bugs show up on some inputs only, so
three hand-picked examples will probably miss them, and a loop over a few
hundred inputs won't.
