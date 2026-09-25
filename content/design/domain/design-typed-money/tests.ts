import { money, add, sum, rate, convert, allocate, type Money, type Currency } from './solution';

const gbp = money(500, 'GBP');
const gbp2 = money(250, 'GBP');
const usd = money(100, 'USD');

// --- the currency is part of the type -----------------------------------------
type _gbp = Expect<Equal<typeof gbp, Money<'GBP'>>>;
type _usd = Expect<Equal<typeof usd, Money<'USD'>>>;
type _notAny = ExpectFalse<IsAny<typeof gbp>>;

// @ts-expect-error not a supported currency
money(100, 'XYZ');

// @ts-expect-error money is immutable
gbp.amountMinor = 1;

// --- arithmetic only within one currency ----------------------------------------
const total = add(gbp, gbp2);
type _total = Expect<Equal<typeof total, Money<'GBP'>>>;
// @ts-expect-error pounds plus dollars
add(gbp, usd);
// @ts-expect-error dollars plus pounds
add(usd, gbp);

const basket = sum('GBP', [gbp, gbp2]);
type _basket = Expect<Equal<typeof basket, Money<'GBP'>>>;
const nothing = sum('JPY', []);
type _nothing = Expect<Equal<typeof nothing, Money<'JPY'>>>;
// @ts-expect-error a dollar amount in a pound basket
sum('GBP', [gbp, usd]);

// --- converting needs a rate in the right direction -----------------------------
const usdToGbp = rate('USD', 'GBP', 0.79);
const converted = convert(usd, usdToGbp);
type _converted = Expect<Equal<typeof converted, Money<'GBP'>>>;
// @ts-expect-error the rate converts USD, not GBP
convert(gbp, usdToGbp);
// @ts-expect-error the result is pounds now
const stillDollars: Money<'USD'> = convert(usd, usdToGbp);

// --- allocation returns exactly one part per ratio --------------------------------
const three = allocate(gbp, [1, 1, 1]);
type _three = Expect<Equal<typeof three, [Money<'GBP'>, Money<'GBP'>, Money<'GBP'>]>>;
const [first, second] = allocate(usd, [3, 1]);
type _first = Expect<Equal<typeof first, Money<'USD'>>>;
type _second = Expect<Equal<typeof second, Money<'USD'>>>;
// @ts-expect-error only two parts come back
const [, , third] = allocate(usd, [3, 1]);
// @ts-expect-error nothing to allocate between
allocate(gbp, []);
declare const someRatios: number[];
// @ts-expect-error a plain number[] might be empty
allocate(gbp, someRatios);
declare const checked: readonly [number, ...number[]];
const many = allocate(gbp, checked);
const firstOfMany: Money<'GBP'> = many[0];

// --- when the currency is only known at runtime --------------------------------
declare const fromDb: Currency;
const dynamic = money(100, fromDb);
type _dynamic = Expect<Equal<typeof dynamic, Money<Currency>>>;
