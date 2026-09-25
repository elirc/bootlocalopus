A shipping calculator has a test for 250 g, one for 1 kg and one for 5 kg,
and all three pass. Then a customer sends a parcel of exactly 500 g and is
charged the 2 kg rate, because someone wrote `<` where the table said "up
to and including". Every one of those tests sat in the **middle** of a band,
where `<` and `<=` give the same answer.

Bugs gather at thresholds: `<` versus `<=`, `floor` versus `ceil`, "over"
versus "from". A test earns its keep when it sits **on** a boundary and
**just past** it, where a wrong comparison gives a different answer.

## The function under test

`shippingCost(weightGrams)` returns a price in **cents**.

| weight | price |
| --- | --- |
| 1 g – 500 g | `395` |
| 501 g – 2000 g | `695` |
| 2001 g – 10000 g | `1295` |
| over 10000 g | `1295` plus `100` for every **started** kilogram over 10 kg |

"Started" means 10001 g and 11000 g are both 1 kg over (`1395`), and 11001 g
is 2 kg over (`1495`).

Anything that is not a positive whole number of grams (`0`, `-5`, `1.5`,
`NaN`) throws a **`RangeError`**.

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`), e.g. `solution.shippingCost(500)`.

- Write **at least 6 tests**. Each one must make an assertion.
- The suite must pass against a **rewrite that behaves the same**. It uses a
  lookup table and a different error message, so assert the error's class
  (`toThrow(RangeError)`), not its wording.
- Six planted bugs must each make at least one of your tests fail.

## The trap

Picking "typical" weights. For each threshold, test the value **on** it and
the value **one gram past** it. Over 10 kg, "started kilogram" has its own
boundaries: just over, mid-kilogram, and exactly on a whole kilogram.

Writing the cases as a table and looping over it (one `it` per row) keeps
twenty boundary checks readable. Each row fails on its own, with its own name.
