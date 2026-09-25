`products.price_cents` answers "what does it cost now?" and destroys the answer
to "what did it cost when this order was placed?" — which is what refunds,
invoices and revenue reports need. Overwrite the price and last quarter's
numbers change.

Temporal data keeps every version with the period it was valid for:
`valid_from` inclusive, `valid_to` **exclusive**, and `valid_to is null` for the
current version. Half-open periods are the whole trick: the old price's
`valid_to` equals the new one's `valid_from`, so every instant belongs to
exactly one version, with no gap and no overlap — as long as you compare with
`>=` and `<`. `between` includes both ends, and an order placed exactly at the
changeover then matches two prices.

The fixture has `products(id, name)`, `product_prices(id, product_id,
price_cents, valid_from timestamptz, valid_to timestamptz)` with a price
history, and `orders(id, product_id, placed_at timestamptz)`.

## Task

1. **A period must be non-empty.** Add a `CHECK` that `valid_to` is null or
   later than `valid_from`.
2. **At most one current price per product.** Add a unique index on
   `product_prices (product_id)` covering only rows where `valid_to is null`.
3. **Changing a price.** Create a function
   `set_price(p_product_id int, p_price_cents int, p_at timestamptz) returns void`
   that ends the product's current price at `p_at` and inserts a new current
   price starting at `p_at`. A product with no current price just gets the new
   row. A change at or before the current price's `valid_from` must fail with
   a check violation (`23514`) — your constraint from step 1 does that for you
   if the statements run in the right order — and leave the history unchanged.
4. **Pricing orders.** Create a view `order_prices(order_id, product_id,
   placed_at, price_cents)` with **one row per order** and the price in effect
   at `placed_at`, or `NULL` when the product had no price yet.

The trap in step 3: insert the new row before closing the old one and the
unique index from step 2 sees two current prices.
